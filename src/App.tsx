import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './App.css';
import {
  createEmptyTab,
  GACHA_COSTS,
  loadProbabilities,
  performSingleRoll,
  getAllGrades,
  getOptionsByGradeAndSlotType,
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
  const [isAnimationOn, setIsAnimationOn] = useState<boolean>(true);
  const [animationSpeed, setAnimationSpeed] = useState<number>(100);
  const [isProbabilitiesLoaded, setIsProbabilitiesLoaded] = useState(false);
  const stopSignalRef = useRef(false);

  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedOption, setSelectedOption] = useState<Option | null>(null);
  const [optionValue, setOptionValue] = useState<number | undefined>(undefined);

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
    const optionsForSelectedGradeAndSlot = getOptionsByGradeAndSlotType(selectedGrade, currentSlotType);
    const selected = optionsForSelectedGradeAndSlot.find(opt => opt.옵션명 === optionName) || null;
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
  }, []);

  const handleConfirm = useCallback(() => {
    if (editingSlotId !== null && selectedOption) {
      setGachaState(prevState => {
        const newTabs = prevState.tabs.map(tab => {
          if (tab.name === prevState.activeTab) {
            const newSlots = tab.slots.map(slot => {
              if (slot.id === editingSlotId) {
                return {
                  ...slot,
                  [modalMode]: { ...selectedOption, 수치: optionValue },
                };
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
  }, [editingSlotId, selectedOption, optionValue, handleCancel, modalMode]);

  const handleSlotClick = useCallback((slotId: number) => {
    const slot = currentTab?.slots.find(s => s.id === slotId);
    if (slot && !slot.isLocked) {
      setEditingSlotId(slotId);
      setModalMode('option');
      
      // Load existing option if present
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

      // Load existing target if present
      if (slot.target) {
        setSelectedGrade(slot.target.등급);
        setSelectedOption(slot.target);
        setOptionValue(slot.target.수치);
      } else {
        setSelectedGrade('');
        setSelectedOption(null);
        setOptionValue(undefined);
      }

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
    setGachaState(prevState => {
      const activeTab = prevState.tabs.find(tab => tab.name === prevState.activeTab);
      if (!activeTab) return prevState;
      const lockedSlotsCount = activeTab.slots.filter(slot => slot.isLocked).length;
      if (lockedSlotsCount === 9) {
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
    const targetedSlots = currentSimulatedTab.slots.filter(slot => slot.target !== null);
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
        currentIterations++;
        currentSimulatedTab = currentSimulatedState.tabs.find(tab => tab.name === currentSimulatedState.activeTab);
        if (currentSimulatedTab) {
          targetAchieved = currentSimulatedTab.slots.some(slot => slot.target !== null && checkTargetAchieved(slot));
        }
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
  }, [gachaState, isProbabilitiesLoaded, isSimulating, isAnimationOn, animationSpeed]);

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
    const targetedSlots = currentSimulatedTab.slots.filter(slot => slot.target !== null);
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

    const areAllTargetsMet = (tab: Tab): boolean => {
      const activeTargetedSlots = tab.slots.filter(slot => slot.target !== null);
      return activeTargetedSlots.length > 0 && activeTargetedSlots.every(slot => checkTargetAchieved(slot));
    };

    const batchSize = isAnimationOn ? animationSpeed : 1000;
    while (currentIterations < maxIterations && !allTargetsAchieved && !stopSignalRef.current) {
      for (let i = 0; i < batchSize && !allTargetsAchieved && !stopSignalRef.current; i++) {
        const { newState } = performSingleRoll(currentSimulatedState, currentSimulatedState.activeTab);
        currentSimulatedState = newState;
        currentSimulatedState.tabs = currentSimulatedState.tabs.map(tab => {
          if (tab.name === currentSimulatedState.activeTab) {
            const updatedSlots = tab.slots.map(slot => (slot.target && !slot.isLocked && checkTargetAchieved(slot)) ? { ...slot, isLocked: true } : slot);
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
  }, [gachaState, isProbabilitiesLoaded, isSimulating, isAnimationOn, animationSpeed]);

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
                  <div className={`target-display ${slot.target?.등급 ? `grade-${slot.target.등급}` : ''}`} onClick={(e) => handleTargetClick(slot.id, e)}>
                    {slot.target ? <p className="target-text">{slot.target.옵션명} {slot.target.수치 ?? ''}</p> : <p className="target-text">목표설정</p>}
                  </div>
                  <span className={`lock-icon ${slot.isLocked ? 'locked-color' : 'unlocked-color'}`} onClick={() => handleToggleLock(gachaState.activeTab, slot.id)}>
                    <img src={slot.isLocked ? "/src/images/locked.png" : "/src/images/unlocked.png"} alt={slot.isLocked ? "Locked" : "Unlocked"} className="lock-image" />
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="gacha-controls">
            <button onClick={handleGachaRoll} disabled={!isProbabilitiesLoaded || isSimulating}>
              분석{' '}
              <span className="cost-text">
                {(() => {
                  const soulCrystalImageMap: Record<string, string> = { '지성': '/src/images/crystal_blue.png', '특수': '/src/images/crystal_sky.png', '야성': '/src/images/crystal_red.png', '자연': '/src/images/crystal_green.png', '변형': '/src/images/crystal_yellow.png' };
                  const soulCrystalImage = soulCrystalImageMap[gachaState.activeTab] || soulCrystalImageMap['지성'];
                  const lockedCount = currentTab?.slots.filter(s => s.isLocked).length || 0;
                  return <>{GACHA_COSTS[lockedCount].soulCrystals}<img src={soulCrystalImage} alt="Soul Crystal" className="cost-image" />{GACHA_COSTS[lockedCount].kina}<img src="/src/images/kina.png" alt="Kina" className="cost-image" /></>;
                })()}
              </span>
            </button>
            <button onClick={handleSingleSimulation} disabled={!isProbabilitiesLoaded || isSimulating}>시뮬레이션(1개)</button>
            <button onClick={handleFullSimulation} disabled={!isProbabilitiesLoaded || isSimulating}>시뮬레이션(전체)</button>
            <button onClick={handleReset} disabled={isSimulating}>전체 리셋</button>
            {isSimulating && (
              <div className="simulation-info">
                <p>시뮬레이션 중...</p>
                <p>횟수: {simulationCount}</p>
                <button onClick={handleStopSimulation}>시뮬레이션 중지</button>
              </div>
            )}
            {!isSimulating && isSimulationFinished && (
              <div className="simulation-info finished">
                <p>시뮬레이션 완료</p>
                <p>횟수: {simulationCount}</p>
              </div>
            )}
            <div className="costs-summary">
              <h2>누적 재화 소모량</h2>
              {tabNames.map(name => {
                const soulCrystalImageMap: Record<string, string> = { '지성': '/src/images/crystal_blue.png', '특수': '/src/images/crystal_sky.png', '야성': '/src/images/crystal_red.png', '자연': '/src/images/crystal_green.png', '변형': '/src/images/crystal_yellow.png' };
                return <p key={name}><img src={soulCrystalImageMap[name]} alt={name} className="cost-image" /> {gachaState.totalSoulCrystalsSpent[name] || 0}</p>;
              })}
              <p><img src="/src/images/kina.png" alt="Kina" className="cost-image" /> {gachaState.totalKinaSpent}</p>
            </div>
          </div>
        </div>
      </div>

      {isCustomizationModalOpen && editingSlotId !== null && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>슬롯 {editingSlotId} {modalMode === 'option' ? '옵션 설정' : '목표 설정'}</h3>
            <div className="modal-controls">
              <select 
                value={selectedGrade} 
                onChange={handleGradeChange} 
                className={selectedGrade ? `grade-${selectedGrade}` : ''}
              >
                <option value="" className="grade-default">등급 선택</option>
                {availableGrades.map(grade => (
                  <option key={grade} value={grade} className={`grade-${grade}`}>{grade}</option>
                ))}
              </select>
              <select value={selectedOption?.옵션명 || ''} onChange={handleOptionChange} disabled={!selectedGrade || !currentSlotType}>
                <option value="">옵션 선택</option>
                {selectedGrade && currentSlotType && getOptionsByGradeAndSlotType(selectedGrade, currentSlotType).map(option => (
                  <option key={option.옵션명} value={option.옵션명}>{option.옵션명} ({option["수치(최소)"]}~{option["수치(최대)"]})</option>
                ))}
              </select>
              {/* Option Value Slider */}
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
              <button onClick={handleConfirm} disabled={!selectedOption || optionValue === undefined}>확인</button>
              <button onClick={handleCancel}>취소</button>
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
            <div className="modal-controls"><button onClick={handleCancel}>닫기</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
