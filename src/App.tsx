import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './App.css';
import {
  createEmptyTab,
  GACHA_COSTS,
  loadProbabilities,
  performSingleRoll,
  getAllGrades,
  getOptionsByGradeAndSlotType,
  getOptionsBySlotType,
  checkTargetAchieved,
} from './utils/gachaUtils';
import type {
  TabName,
  GachaState,
  Option,
  Tab,
} from './utils/gachaUtils';

const tabNames: TabName[] = ["지성", "야성", "자연", "변형", "특수"];

function App() {
  const initialGachaState: GachaState = {
    tabs: tabNames.map(name => createEmptyTab(name)),
    activeTab: "지성",
    totalSoulCrystalsSpent: tabNames.reduce((acc, name) => ({ ...acc, [name]: 0 }), {} as Record<TabName, number>),
    totalKinaSpent: 0,
  };

  const [gachaState, setGachaState] = useState<GachaState>(initialGachaState);
  const [isCustomizationModalOpen, setIsCustomizationModalOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [modalMode, setModalMode] = useState<'option' | 'target'>('option');
  const [availableGrades, setAvailableGrades] = useState<string[]>([]);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationCount, setSimulationCount] = useState<number>(0);
  const [isSimulationFinished, setIsSimulationFinished] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isSimMenuOpen, setIsSimMenuOpen] = useState<boolean>(false); // New state for simulation menu
  const [statistics, setStatistics] = useState<{
    count: number;
    totalRolls: number;
    minRun: { rolls: number; kina: number; soulCrystals: Record<TabName, number> } | null;
    maxRun: { rolls: number; kina: number; soulCrystals: Record<TabName, number> } | null;
    avgSoulCrystals: Record<TabName, number>;
    avgKina: number;
    avgRolls: number;
  } | null>(null); // New state for statistics results
  const [isAnimationOn, setIsAnimationOn] = useState<boolean>(true);
  const [animationSpeed, setAnimationSpeed] = useState<number>(100);
  const [isProbabilitiesLoaded, setIsProbabilitiesLoaded] = useState(false);
  const [showUnpopularOptions, setShowUnpopularOptions] = useState<boolean>(false);
  const stopSignalRef = useRef(false);

  const UNPOPULAR_OPTIONS = ['정신력', '보스 공격력', '치명타 공격력', '완벽', '재생', '무기 피해 내성', '치명타 피해 내성'];
  const UNPOPULAR_KEYWORDS = ['종족', '방어력', '치명타 저항', 'pve', '관통', '봉혼석 추가 피해'];

  const isUnpopular = (optionName: string) => {
    const lowerName = optionName.toLowerCase();
    const isMatch = UNPOPULAR_OPTIONS.includes(optionName) || 
                   UNPOPULAR_KEYWORDS.some(keyword => lowerName.includes(keyword.toLowerCase()));
    const isBacksideUnpopular = optionName.includes('후방') && optionName !== '후방 피해 증폭';
    return isMatch || isBacksideUnpopular;
  };

  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedOption, setSelectedOption] = useState<Option | null>(null);
  const [optionValue, setOptionValue] = useState<number | undefined>(undefined);
  const [editingTargets, setEditingTargets] = useState<Option[]>([]);

  useEffect(() => {
    loadProbabilities().then(() => {
      setIsProbabilitiesLoaded(true);
      setAvailableGrades(getAllGrades());
    });
  }, []);

  const currentTab = useMemo(() => gachaState.tabs.find(tab => tab.name === gachaState.activeTab), [gachaState]);

  const currentSlotType = useMemo(() => {
    if (editingSlotId === null || !currentTab) return '';
    const slotTypePrefix = (currentTab.name === "특수") ? "특수" : "일반";
    return `${slotTypePrefix}${editingSlotId}`;
  }, [editingSlotId, currentTab]);

  const handleGradeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const grade = event.target.value;
    setSelectedGrade(grade);
    setSelectedOption(null);
    setOptionValue(undefined);
  }, []);

  const handleOptionChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const optionName = event.target.value;
    const optionsForSlot = selectedGrade 
      ? getOptionsByGradeAndSlotType(selectedGrade, currentSlotType)
      : getOptionsBySlotType(currentSlotType);
    const selected = optionsForSlot.find(opt => opt.옵션명 === optionName) || null;
    setSelectedOption(selected);
    if (selected) {
      setOptionValue(selected["수치(최소)"]);
    } else {
      setOptionValue(undefined);
    }
  }, [selectedGrade, currentSlotType]);

  const handleValueChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setOptionValue(parseFloat(event.target.value));
  }, []);

  const handleCancel = useCallback(() => {
    setIsCustomizationModalOpen(false);
    setIsSettingsModalOpen(false);
    setEditingSlotId(null);
    setModalMode('option');
    setSelectedGrade('');
    setSelectedOption(null);
    setOptionValue(undefined);
    setEditingTargets([]);
  }, []);

  const handleResetSlot = useCallback(() => {
    if (editingSlotId !== null) {
      setGachaState(prevState => {
        const newTabs = prevState.tabs.map(tab => {
          if (tab.name === prevState.activeTab) {
            const newSlots = tab.slots.map(slot => {
              if (slot.id === editingSlotId) {
                if (modalMode === 'option') {
                  return { ...slot, option: null, isLocked: false };
                } else {
                  return { ...slot, targets: [] };
                }
              }
              return slot;
            });
            return { ...tab, slots: newSlots };
          }
          return tab;
        });
        return { ...prevState, tabs: newTabs };
      });
    }
    handleCancel();
  }, [editingSlotId, modalMode, handleCancel]);

  const handleConfirm = useCallback(() => {
    if (editingSlotId !== null) {
      setGachaState(prevState => {
        const newTabs = prevState.tabs.map(tab => {
          if (tab.name === prevState.activeTab) {
            const newSlots = tab.slots.map(slot => {
              if (slot.id === editingSlotId) {
                if (modalMode === 'option') {
                  return {
                    ...slot,
                    option: selectedOption ? { ...selectedOption, 수치: optionValue } : null,
                  };
                } else {
                  return {
                    ...slot,
                    targets: editingTargets,
                  };
                }
              }
              return slot;
            });
            return { ...tab, slots: newSlots };
          }
          return tab;
        });
        return { ...prevState, tabs: newTabs };
      });
    }
    handleCancel();
  }, [editingSlotId, selectedOption, optionValue, editingTargets, handleCancel, modalMode]);

  const handleAddTarget = useCallback(() => {
    if (selectedOption && optionValue !== undefined) {
      const newTarget = { ...selectedOption, 수치: optionValue };
      if (!editingTargets.some(t => t.옵션명 === newTarget.옵션명 && t.등급 === newTarget.등급 && t.수치 === newTarget.수치)) {
        setEditingTargets(prev => [...prev, newTarget]);
      }
    }
  }, [selectedOption, optionValue, editingTargets]);

  const handleRemoveTarget = useCallback((index: number) => {
    setEditingTargets(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSlotClick = useCallback((slotId: number) => {
    const slot = currentTab?.slots.find(s => s.id === slotId);
    if (slot && !slot.isLocked) {
      setEditingSlotId(slotId);
      setModalMode('option');
      if (slot.option) {
        setSelectedGrade(slot.option.등급);
        setSelectedOption(slot.option);
        setOptionValue(slot.option.수치);
      } else {
        setSelectedGrade('');
        setSelectedOption(null);
        setOptionValue(undefined);
      }
      setIsCustomizationModalOpen(true);
    }
  }, [currentTab]);

  const handleTargetClick = useCallback((slotId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const slot = currentTab?.slots.find(s => s.id === slotId);
    if (slot) {
      setEditingSlotId(slotId);
      setModalMode('target');
      setSelectedGrade('');
      setSelectedOption(null);
      setOptionValue(undefined);
      setEditingTargets(slot.targets || []);
      setIsCustomizationModalOpen(true);
    }
  }, [currentTab]);

  const handleTabChange = useCallback((tabName: TabName) => {
    setGachaState(prevState => ({ ...prevState, activeTab: tabName }));
  }, []);

  const handleToggleLock = useCallback((tabName: TabName, slotId: number) => {
    setGachaState(prevState => {
      const newTabs = prevState.tabs.map(tab => {
        if (tab.name === tabName) {
          const newSlots = tab.slots.map(slot =>
            slot.id === slotId ? { ...slot, isLocked: !slot.isLocked } : slot
          );
          return { ...tab, slots: newSlots };
        }
        return tab;
      });
      return { ...prevState, tabs: newTabs };
    });
  }, []);

  const handleGachaRoll = useCallback(() => {
    if (!isProbabilitiesLoaded) {
      alert("확률 정보 로딩 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setIsSimulationFinished(false);
    setStatistics(null);
    setGachaState(prevState => {
      const activeTab = prevState.tabs.find(tab => tab.name === prevState.activeTab);
      if (!activeTab) return prevState;
      if (activeTab.slots.filter(slot => slot.isLocked).length === 9) {
        alert("모든 슬롯이 잠겨 있습니다. 가챠를 진행할 수 없습니다.");
        return prevState;
      }
      const { newState } = performSingleRoll(prevState, prevState.activeTab);
      return newState;
    });
  }, [isProbabilitiesLoaded]);

  const handleReset = useCallback(() => {
    setGachaState(prevState => ({
      ...prevState,
      tabs: prevState.tabs.map(tab => ({
        ...tab,
        slots: tab.slots.map(slot => ({
          ...slot,
          option: null,
          isLocked: false
        }))
      })),
      totalSoulCrystalsSpent: tabNames.reduce((acc, name) => ({ ...acc, [name]: 0 }), {} as Record<TabName, number>),
      totalKinaSpent: 0
    }));
    setSimulationCount(0);
    setIsSimulationFinished(false);
    setStatistics(null);
  }, []);

  const handleStopSimulation = useCallback(() => {
    stopSignalRef.current = true;
    setIsSimulating(false);
    setIsSimulationFinished(true);
  }, []);

  const handleSingleSimulation = useCallback(async () => {
    if (!isProbabilitiesLoaded) {
      alert("확률 정보 로딩 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    if (isSimulating) return;

    stopSignalRef.current = false;
    setIsSimulating(true);
    setIsSimulationFinished(false);
    setSimulationCount(0);

    let currentSimulatedState = JSON.parse(JSON.stringify(gachaState)) as GachaState;
    let currentIterations = 0;
    const maxIterations = 100000;
    let targetAchieved = false;

    let currentSimulatedTab = currentSimulatedState.tabs.find(tab => tab.name === currentSimulatedState.activeTab);
    if (!currentSimulatedTab) {
      setIsSimulating(false);
      return;
    }
    const targetedSlots = currentSimulatedTab.slots.filter(slot => slot.targets.length > 0);
    if (targetedSlots.length === 0) {
      alert("목표가 설정된 슬롯이 없습니다.");
      setIsSimulating(false);
      return;
    }
    if (currentSimulatedTab.slots.filter(slot => slot.isLocked).length === 9) {
        alert("모든 슬롯이 잠겨 있습니다. 시뮬레이션을 진행할 수 없습니다.");
        setIsSimulating(false);
        return;
    }

    const batchSize = isAnimationOn ? animationSpeed : 1000;
    while (currentIterations < maxIterations && !targetAchieved && !stopSignalRef.current) {
      for (let i = 0; i < batchSize && !targetAchieved && !stopSignalRef.current; i++) {
        const { newState } = performSingleRoll(currentSimulatedState, currentSimulatedState.activeTab);
        currentSimulatedState = newState;
        
        currentSimulatedTab = currentSimulatedState.tabs.find(tab => tab.name === currentSimulatedState.activeTab);
        if (currentSimulatedTab) {
          targetAchieved = currentSimulatedTab.slots.some(slot => 
            slot.targets.length > 0 && !slot.isLocked && checkTargetAchieved(slot)
          );
        }

        currentSimulatedState.tabs = currentSimulatedState.tabs.map(tab => {
          if (tab.name === currentSimulatedState.activeTab) {
            const updatedSlots = tab.slots.map(slot => 
              (slot.targets.length > 0 && !slot.isLocked && checkTargetAchieved(slot)) 
                ? { ...slot, isLocked: true } 
                : slot
            );
            return { ...tab, slots: updatedSlots };
          }
          return tab;
        });

        currentIterations++;
      }
      if (isAnimationOn) {
        setSimulationCount(currentIterations);
        setGachaState(currentSimulatedState);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    setSimulationCount(currentIterations);
    setGachaState(currentSimulatedState);
    setIsSimulating(false);
    setIsSimulationFinished(true);
  }, [gachaState, isProbabilitiesLoaded, isSimulating, isAnimationOn, animationSpeed, stopSignalRef]);

  const handleFullSimulation = useCallback(async () => {
    if (!isProbabilitiesLoaded) {
      alert("확률 정보 로딩 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    if (isSimulating) return;

    stopSignalRef.current = false;
    setIsSimulating(true);
    setIsSimulationFinished(false);
    setSimulationCount(0);

    let currentSimulatedState = JSON.parse(JSON.stringify(gachaState)) as GachaState;
    let currentIterations = 0;
    const maxIterations = 1000000;
    let allTargetsAchieved = false;

    let currentSimulatedTab = currentSimulatedState.tabs.find(tab => tab.name === currentSimulatedState.activeTab);
    if (!currentSimulatedTab) {
      setIsSimulating(false);
      return;
    }
    if (currentSimulatedTab.slots.filter(slot => slot.targets.length > 0).length === 0) {
      alert("목표가 설정된 슬롯이 없습니다.");
      setIsSimulating(false);
      return;
    }
    if (currentSimulatedTab.slots.filter(slot => slot.isLocked).length === 9) {
        alert("모든 슬롯이 잠겨 있습니다. 시뮬레이션을 진행할 수 없습니다.");
        setIsSimulating(false);
        return;
    }

    const areAllTargetsMet = (tab: Tab): boolean => {
      const activeTargetedSlots = tab.slots.filter(slot => slot.targets.length > 0);
      return activeTargetedSlots.length > 0 && activeTargetedSlots.every(slot => checkTargetAchieved(slot));
    };

    const batchSize = isAnimationOn ? animationSpeed : 1000;
    while (currentIterations < maxIterations && !allTargetsAchieved && !stopSignalRef.current) {
      for (let i = 0; i < batchSize && !allTargetsAchieved && !stopSignalRef.current; i++) {
        const { newState } = performSingleRoll(currentSimulatedState, currentSimulatedState.activeTab);
        currentSimulatedState = newState;
        currentSimulatedState.tabs = currentSimulatedState.tabs.map(tab => {
          if (tab.name === currentSimulatedState.activeTab) {
            const updatedSlots = tab.slots.map(slot => (slot.targets.length > 0 && !slot.isLocked && checkTargetAchieved(slot)) ? { ...slot, isLocked: true } : slot);
            return { ...tab, slots: updatedSlots };
          }
          return tab;
        });
        currentIterations++;
        currentSimulatedTab = currentSimulatedState.tabs.find(tab => tab.name === currentSimulatedState.activeTab);
        if (currentSimulatedTab) allTargetsAchieved = areAllTargetsMet(currentSimulatedTab);
      }
      if (isAnimationOn) {
        setSimulationCount(currentIterations);
        setGachaState(currentSimulatedState);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    setSimulationCount(currentIterations);
    setGachaState(currentSimulatedState);
    setIsSimulating(false);
    setIsSimulationFinished(true);
  }, [gachaState, isProbabilitiesLoaded, isSimulating, isAnimationOn, animationSpeed, stopSignalRef]);

  const handleStatisticsSimulation = useCallback(async () => {
    if (!isProbabilitiesLoaded) {
      alert("확률 정보 로딩 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    if (isSimulating) return;

    stopSignalRef.current = false;
    setIsSimulating(true);
    setIsSimulationFinished(false);
    setStatistics(null);
    setSimulationCount(0);

    const numRuns = 1000;
    let accumulatedKina = 0;
    let accumulatedRolls = 0;
    const accumulatedSoulCrystals: Record<TabName, number> = tabNames.reduce((acc, name) => ({ ...acc, [name]: 0 }), {} as Record<TabName, number>);

    let currentMinRun: { rolls: number; kina: number; soulCrystals: Record<TabName, number> } | null = null;
    let currentMaxRun: { rolls: number; kina: number; soulCrystals: Record<TabName, number> } | null = null;

    const activeTabName = gachaState.activeTab;

    for (let run = 1; run <= numRuns && !stopSignalRef.current; run++) {
      let currentRunState = JSON.parse(JSON.stringify(gachaState)) as GachaState;
      currentRunState.tabs = currentRunState.tabs.map(tab => ({
        ...tab,
        slots: tab.slots.map(slot => ({ ...slot, option: null, isLocked: false }))
      }));
      currentRunState.totalKinaSpent = 0;
      currentRunState.totalSoulCrystalsSpent = tabNames.reduce((acc, name) => ({ ...acc, [name]: 0 }), {} as Record<TabName, number>);

      let allTargetsAchieved = false;
      let runRolls = 0;

      const areAllTargetsMet = (tab: Tab): boolean => {
        const activeTargetedSlots = tab.slots.filter(slot => slot.targets.length > 0);
        return activeTargetedSlots.length > 0 && activeTargetedSlots.every(slot => checkTargetAchieved(slot));
      };

      const currentActiveTab = currentRunState.tabs.find(t => t.name === activeTabName);
      if (!currentActiveTab || currentActiveTab.slots.filter(s => s.targets.length > 0).length === 0) {
        alert("목표가 설정된 슬롯이 없습니다.");
        setIsSimulating(false);
        return;
      }

      while (!allTargetsAchieved && !stopSignalRef.current) {
        const batchSize = 100;
        for (let i = 0; i < batchSize && !allTargetsAchieved && !stopSignalRef.current; i++) {
          const { newState } = performSingleRoll(currentRunState, activeTabName);
          currentRunState = newState;
          runRolls++;

          currentRunState.tabs = currentRunState.tabs.map(tab => {
            if (tab.name === activeTabName) {
              const updatedSlots = tab.slots.map(slot => (slot.targets.length > 0 && !slot.isLocked && checkTargetAchieved(slot)) ? { ...slot, isLocked: true } : slot);
              return { ...tab, slots: updatedSlots };
            }
            return tab;
          });
          const currentTab = currentRunState.tabs.find(tab => tab.name === activeTabName);
          if (currentTab) allTargetsAchieved = areAllTargetsMet(currentTab);
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      if (stopSignalRef.current) break;

      accumulatedKina += currentRunState.totalKinaSpent;
      accumulatedRolls += runRolls;
      tabNames.forEach(name => {
        accumulatedSoulCrystals[name] += currentRunState.totalSoulCrystalsSpent[name];
      });

      const runResult = {
        rolls: runRolls,
        kina: currentRunState.totalKinaSpent,
        soulCrystals: { ...currentRunState.totalSoulCrystalsSpent }
      };

      if (!currentMinRun || runRolls < currentMinRun.rolls) currentMinRun = runResult;
      if (!currentMaxRun || runRolls > currentMaxRun.rolls) currentMaxRun = runResult;

      setStatistics({
        count: run,
        totalRolls: accumulatedRolls,
        minRun: currentMinRun,
        maxRun: currentMaxRun,
        avgKina: Math.floor(accumulatedKina / run),
        avgRolls: Math.floor(accumulatedRolls / run),
        avgSoulCrystals: tabNames.reduce((acc, name) => ({ 
          ...acc, 
          [name]: Math.floor(accumulatedSoulCrystals[name] / run) 
        }), {} as Record<TabName, number>)
      });

      setSimulationCount(run);
      setGachaState(currentRunState);
    }

    setIsSimulating(false);
    setIsSimulationFinished(true);
  }, [gachaState, isProbabilitiesLoaded, isSimulating, isAnimationOn, stopSignalRef]);

  return (
    <div className="App">
      <h1>아이온2 펫작 시뮬레이터</h1>
      <div className="tab-buttons">
        {tabNames.map(name => (
          <button key={name} className={gachaState.activeTab === name ? "active" : ""} onClick={() => handleTabChange(name)}>{name}</button>
        ))}
        <button className="settings-button" onClick={() => setIsSettingsModalOpen(true)}>⚙️ 설정</button>
      </div>

      <div className="gacha-area">
        <div className="main-content-area">
          <div className="slots-container">
            {currentTab?.slots.map(slot => (
              <div key={slot.id} className={`slot-item ${slot.isLocked ? "locked" : ""}`}>
                <div className="slot-content">
                  <div className={`option-display ${slot.option?.등급 ? `grade-${slot.option.등급}` : ''}`} onClick={() => handleSlotClick(slot.id)}>
                    {slot.option ? <p>{slot.option.옵션명} {slot.option.수치 ?? ''}</p> : <p>옵션 없음</p>}
                  </div>
                  <div className="target-display" onClick={(e) => handleTargetClick(slot.id, e)}>
                    {slot.targets && slot.targets.length > 0 ? (
                      <p className="target-text has-targets">
                        {slot.targets[0].옵션명} {slot.targets[0].수치}
                        {slot.targets.length > 1 ? ` (외 ${slot.targets.length - 1})` : ''}
                      </p>
                    ) : (
                      <p className="target-text">목표설정</p>
                    )}
                  </div>
                  <span className={`lock-icon ${slot.isLocked ? 'locked-color' : 'unlocked-color'}`} onClick={() => handleToggleLock(gachaState.activeTab, slot.id)}>
                    <img src={slot.isLocked ? "images/locked.png" : "images/unlocked.png"} alt={slot.isLocked ? "Locked" : "Unlocked"} className="lock-image" />
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="gacha-controls">
            <button 
              onClick={handleGachaRoll} 
              disabled={!isProbabilitiesLoaded || isSimulating || (currentTab?.slots.filter(s => s.isLocked).length === 9)}
            >
              분석{' '}
              <span className="cost-text">
                {(() => {
                  const soulCrystalImageMap: Record<string, string> = { '지성': 'images/crystal_blue.png', '특수': 'images/crystal_sky.png', '야성': 'images/crystal_red.png', '자연': 'images/crystal_green.png', '변형': 'images/crystal_yellow.png' };
                  const soulCrystalImage = soulCrystalImageMap[gachaState.activeTab] || soulCrystalImageMap['지성'];
                  const lockedCount = currentTab?.slots.filter(s => s.isLocked).length || 0;
                  if (lockedCount === 9) return "불가능";
                  return <>{GACHA_COSTS[lockedCount].soulCrystals}<img src={soulCrystalImage} alt="Soul Crystal" className="cost-image" />{GACHA_COSTS[lockedCount].kina}<img src="images/kina.png" alt="Kina" className="cost-image" /></>;
                })()}
              </span>
            </button>
            <div className="simulation-menu-container">
              <button 
                className={`main-sim-button ${isSimMenuOpen ? 'active' : ''}`}
                onClick={() => setIsSimMenuOpen(!isSimMenuOpen)}
                disabled={!isProbabilitiesLoaded || isSimulating || (currentTab?.slots.filter(s => s.isLocked).length === 9)}
              >
                시뮬레이션 {isSimMenuOpen ? '▲' : '▼'}
              </button>
              {isSimMenuOpen && (
                <div className="sim-sub-menu">
                  <button onClick={() => { handleSingleSimulation(); setIsSimMenuOpen(false); }}>1개 목표 달성</button>
                  <button onClick={() => { handleFullSimulation(); setIsSimMenuOpen(false); }}>전체 목표 달성</button>
                  <button onClick={() => { handleStatisticsSimulation(); setIsSimMenuOpen(false); }}>통계 시뮬레이션</button>
                </div>
              )}
            </div>
            <button onClick={handleReset} disabled={isSimulating}>전체 리셋</button>
            {isSimulating && !statistics && (
              <div className="simulation-info">
                <p>시뮬레이션 중...</p>
                <p>횟수: {simulationCount}</p>
                <button onClick={handleStopSimulation}>시뮬레이션 중지</button>
              </div>
            )}
            {!isSimulating && isSimulationFinished && !statistics && (
              <div className="simulation-info finished">
                <p>시뮬레이션 완료</p>
                <p>횟수: {simulationCount}</p>
              </div>
            )}
            {isSimulating && statistics && (
              <div className="simulation-info">
                <p>통계 산출 중...</p>
                <p>실행 횟수: {simulationCount} / 1000</p>
                <button onClick={handleStopSimulation}>시뮬레이션 중지</button>
              </div>
            )}
            {(isSimulating || isSimulationFinished || statistics) && statistics ? (
              <div className="statistics-results active-results">
                <h3>{statistics.count}회 통계</h3>
                <div className="stat-grid">
                  <div className="stat-item">
                    <span className="stat-header">평균 소모량 (분석: {statistics.avgRolls.toLocaleString()}회)</span>
                    <div className="stat-values">
                      {tabNames.map(name => (
                        statistics.avgSoulCrystals[name] > 0 && (
                          <p key={name}>
                            <img src={({ '지성': 'images/crystal_blue.png', '특수': 'images/crystal_sky.png', '야성': 'images/crystal_red.png', '자연': 'images/crystal_green.png', '변형': 'images/crystal_yellow.png' } as Record<string, string>)[name]} alt={name} className="cost-image" /> {statistics.avgSoulCrystals[name].toLocaleString()}
                          </p>
                        )
                      ))}
                      <p><img src="images/kina.png" alt="Kina" className="cost-image" /> {statistics.avgKina.toLocaleString()}</p>
                    </div>
                  </div>
                  {statistics.minRun && (
                    <div className="stat-item highlight">
                      <span className="stat-header">최소 소모 (분석: {statistics.minRun.rolls.toLocaleString()}회)</span>
                      <div className="stat-values">
                        {tabNames.map(name => (
                          statistics.minRun!.soulCrystals[name as TabName] > 0 && (
                            <p key={name}>
                              <img src={({ '지성': 'images/crystal_blue.png', '특수': 'images/crystal_sky.png', '야성': 'images/crystal_red.png', '자연': 'images/crystal_green.png', '변형': 'images/crystal_yellow.png' } as Record<string, string>)[name]} alt={name} className="cost-image" /> {statistics.minRun!.soulCrystals[name as TabName].toLocaleString()}
                            </p>
                          )
                        ))}
                        <p><img src="images/kina.png" alt="Kina" className="cost-image" /> {statistics.minRun.kina.toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                  {statistics.maxRun && (
                    <div className="stat-item highlight">
                      <span className="stat-header">최대 소모 (분석: {statistics.maxRun.rolls.toLocaleString()}회)</span>
                      <div className="stat-values">
                        {tabNames.map(name => (
                          statistics.maxRun!.soulCrystals[name as TabName] > 0 && (
                            <p key={name}>
                              <img src={({ '지성': 'images/crystal_blue.png', '특수': 'images/crystal_sky.png', '야성': 'images/crystal_red.png', '자연': 'images/crystal_green.png', '변형': 'images/crystal_yellow.png' } as Record<string, string>)[name]} alt={name} className="cost-image" /> {statistics.maxRun!.soulCrystals[name as TabName].toLocaleString()}
                            </p>
                          )
                        ))}
                        <p><img src="images/kina.png" alt="Kina" className="cost-image" /> {statistics.maxRun.kina.toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="costs-summary">
                <h2>누적 재화 소모량</h2>
                {tabNames.map(name => {
                  const soulCrystalImageMap: Record<string, string> = { '지성': 'images/crystal_blue.png', '특수': 'images/crystal_sky.png', '야성': 'images/crystal_red.png', '자연': 'images/crystal_green.png', '변형': 'images/crystal_yellow.png' };
                  return <p key={name}><img src={soulCrystalImageMap[name]} alt={name} className="cost-image" /> {gachaState.totalSoulCrystalsSpent[name] || 0}</p>;
                })}
                <p><img src="images/kina.png" alt="Kina" className="cost-image" /> {gachaState.totalKinaSpent.toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isCustomizationModalOpen && editingSlotId !== null && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>슬롯 {editingSlotId} {modalMode === 'option' ? '옵션 설정' : '목표 설정'}</h3>
            
            {modalMode === 'target' && (
              <div className="target-list">
                {editingTargets.map((target, index) => (
                  <div key={index} className={`target-tag grade-${target.등급}`}>
                    <span>{target.옵션명} {target.수치}</span>
                    <button className="remove-tag" onClick={() => handleRemoveTarget(index)}>×</button>
                  </div>
                ))}
                {editingTargets.length === 0 && <p className="empty-targets">설정된 목표가 없습니다.</p>}
              </div>
            )}

            <div className="modal-controls">
              {modalMode === 'option' && (
                <select 
                  value={selectedGrade} 
                  onChange={handleGradeChange} 
                  className={selectedGrade ? `grade-${selectedGrade}` : ''}
                >
                  <option value="" className="grade-default">등급 선택 (전체)</option>
                  {availableGrades.map(grade => (
                    <option key={grade} value={grade} className={`grade-${grade}`}>{grade}</option>
                  ))}
                </select>
              )}
              <select value={selectedOption?.옵션명 || ''} onChange={handleOptionChange} disabled={!currentSlotType}>
                <option value="">옵션 선택</option>
                {(modalMode === 'option' && selectedGrade 
                  ? getOptionsByGradeAndSlotType(selectedGrade, currentSlotType) 
                  : getOptionsBySlotType(currentSlotType)
                )
                .filter(option => showUnpopularOptions || !isUnpopular(option.옵션명))
                .map(option => (
                  <option key={option.옵션명} value={option.옵션명}>{option.옵션명} ({option["수치(최소)"]}~{option["수치(최대)"]})</option>
                ))}
              </select>
              <div className="option-value-container">
                <input 
                  type="range" 
                  value={optionValue ?? 0} 
                  onChange={handleValueChange} 
                  disabled={!selectedOption} 
                  min={selectedOption?.["수치(최소)"] ?? 0} 
                  max={selectedOption?.["수치(최대)"] ?? 100} 
                  step={selectedOption ? (selectedOption["수치(최소)"] % 1 === 0 ? 1 : 0.1) : 0.1} 
                />
                <span className="value-display">
                  {optionValue !== undefined ? optionValue : '-'}
                </span>
              </div>

              {modalMode === 'target' ? (
                <>
                  <button onClick={handleAddTarget} disabled={!selectedOption || optionValue === undefined} className="add-button">목표 추가</button>
                  <div className="modal-footer-buttons">
                    <button onClick={handleConfirm} className="confirm-button">확인</button>
                    <button onClick={handleResetSlot} className="reset-button">초기화</button>
                  </div>
                </>
              ) : (
                <>
                  <button onClick={handleConfirm} disabled={!selectedOption || optionValue === undefined}>확인</button>
                  <button onClick={handleResetSlot} className="reset-button">초기화</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {isSettingsModalOpen && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
            <h3>설정</h3>
            <div className="settings-section">
              <h4>시뮬레이션</h4>
              <div className="settings-item">
                <span>애니메이션</span>
                <div className="settings-controls">
                  <button 
                    className={`toggle-button ${isAnimationOn ? 'on' : 'off'}`}
                    onClick={() => setIsAnimationOn(!isAnimationOn)}
                  >
                    {isAnimationOn ? 'ON' : 'OFF'}
                  </button>
                  <div className={`slider-container ${!isAnimationOn ? 'hidden' : ''}`}>
                    <input 
                      type="range" 
                      min="1" 
                      max="1000" 
                      value={animationSpeed} 
                      onChange={(e) => setAnimationSpeed(parseInt(e.target.value))}
                      disabled={!isAnimationOn}
                    />
                    <span className="slider-label">애니메이션 속도 ({animationSpeed})</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="settings-section">
              <h4>UI 설정</h4>
              <div className="settings-item">
                <span>비인기 옵션 보기</span>
                <div className="settings-controls">
                  <button 
                    className={`toggle-button ${showUnpopularOptions ? 'on' : 'off'}`}
                    onClick={() => setShowUnpopularOptions(!showUnpopularOptions)}
                  >
                    {showUnpopularOptions ? 'ON' : 'OFF'}
                  </button>
                  <div className="slider-container hidden">
                    <input type="range" disabled />
                    <span className="slider-label">정렬용 여백</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-controls"><button onClick={handleCancel}>닫기</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
