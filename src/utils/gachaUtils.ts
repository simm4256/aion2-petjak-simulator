// aion2-petjak-simulator/src/utils/gachaUtils.ts

export interface Option {
  슬롯: string;
  옵션명: string;
  등급: string;
  "수치(최소)": number;
  "수치(최대)": number;
  "확률(%)": number;
  수치?: number; // Add optional actual value
}

export interface ProcessedOption extends Option {
  cumulativeProbability: number;
}

export interface Slot {
  id: number; // 1 to 9
  option: Option | null;
  isLocked: boolean;
  targets: Option[]; // Changed from target: Option | null to targets: Option[]
}

export type TabName = "지성" | "야성" | "자연" | "변형" | "특수";

export interface Tab {
  name: TabName;
  slots: Slot[];
}

export interface GachaState {
  tabs: Tab[];
  activeTab: TabName;
  totalSoulCrystalsSpent: Record<TabName, number>; // Changed to track by tab name
  totalKinaSpent: number;
}

// Function to initialize a tab with 9 empty, unlocked slots
export const createEmptyTab = (name: TabName): Tab => {
  const slots: Slot[] = Array.from({ length: 9 }, (_, i) => ({
    id: i + 1,
    option: null,
    isLocked: false,
    targets: [], // Initialize as empty array
  }));
  return { name, slots };
};

// Cost configuration based on number of locked slots
export const GACHA_COSTS = [
  { soulCrystals: 45, kina: 9000 },   // 0 locked slots
  { soulCrystals: 50, kina: 10000 },  // 1 locked slot
  { soulCrystals: 55, kina: 11000 },  // 2 locked slots
  { soulCrystals: 75, kina: 15000 },  // 3 locked slots
  { soulCrystals: 120, kina: 24000 }, // 4 locked slots
  { soulCrystals: 215, kina: 43000 }, // 5 locked slots
  { soulCrystals: 310, kina: 62000 }, // 6 locked slots
  { soulCrystals: 405, kina: 81000 }, // 7 locked slots
  { soulCrystals: 500, kina: 100000 },// 8 locked slots
];

// This will hold the processed probabilities once loaded
let processedProbabilities: Record<string, ProcessedOption[]> = {};

export async function loadProbabilities(): Promise<void> {
  // Dynamically import the JSON file
  const probabilitiesJson = await import("../data/probabilities.json");
  const data: Option[] = probabilitiesJson.default;

  const groupedBySlot: Record<string, Option[]> = {};

  data.forEach(option => {
    if (!groupedBySlot[option.슬롯]) {
      groupedBySlot[option.슬롯] = [];
    }
    groupedBySlot[option.슬롯].push(option);
  });

  // Process each group to add cumulative probabilities
  for (const slotType in groupedBySlot) {
    let cumulative = 0;
    processedProbabilities[slotType] = groupedBySlot[slotType]
      .sort((a, b) => a["확률(%)"] - b["확률(%)"]) // Sort to ensure cumulative calculation is correct
      .map((option) => {
        cumulative += option["확률(%)"];
        return { ...option, cumulativeProbability: cumulative };
      });

    // Normalize cumulative probabilities to 100%
    const totalProbability = cumulative;
    processedProbabilities[slotType] = processedProbabilities[slotType].map(opt => ({
      ...opt,
      cumulativeProbability: (opt.cumulativeProbability / totalProbability) * 100
    }));
  }
}

export function getRandomOption(slotType: string): Option | null {
  const options = processedProbabilities[slotType];
  if (!options || options.length === 0) {
    console.warn(`No probabilities found for slot type: ${slotType}`);
    return null;
  }

  const randomValue = Math.random() * 100; // Random number between 0 and 100

  for (const option of options) {
    if (randomValue <= option.cumulativeProbability) {
      let actualValue: number;
      if (option["수치(최소)"] % 1 === 0 && option["수치(최대)"] % 1 === 0) {
        // Integer range: generate random integer
        actualValue = Math.floor(Math.random() * (option["수치(최대)"] - option["수치(최소)"] + 1)) + option["수치(최소)"];
      } else {
        // Floating-point range with 0.1 step:
        const range = option["수치(최대)"] - option["수치(최소)"];
        const numSteps = Math.round(range / 0.1); // Number of 0.1 increments
        const randomStep = Math.floor(Math.random() * (numSteps + 1));
        actualValue = parseFloat((option["수치(최소)"] + randomStep * 0.1).toFixed(1));
      }
      return {
        슬롯: option.슬롯,
        옵션명: option.옵션명,
        등급: option.등급,
        "수치(최소)": option["수치(최소)"],
        "수치(최대)": option["수치(최대)"],
        "확률(%)": option["확률(%)"],
        수치: actualValue, // Assign the randomly generated value
      };
    }
  }

  // Fallback in case of rounding errors or no match (should not happen if probabilities sum to 100)
  const lastOption = options[options.length - 1];
  let actualValue: number;
  if (lastOption["수치(최소)"] % 1 === 0 && lastOption["수치(최대)"] % 1 === 0) {
    actualValue = Math.floor(Math.random() * (lastOption["수치(최대)"] - lastOption["수치(최소)"] + 1)) + lastOption["수치(최소)"];
  } else {
    const range = lastOption["수치(최대)"] - lastOption["수치(최소)"];
    const numSteps = Math.round(range / 0.1);
    const randomStep = Math.floor(Math.random() * (numSteps + 1));
    actualValue = parseFloat((lastOption["수치(최소)"] + randomStep * 0.1).toFixed(1));
  }
  return { ...lastOption, 수치: actualValue };
}

export function getAllGrades(): string[] {
  const grades = new Set<string>();
  for (const slotType in processedProbabilities) {
    processedProbabilities[slotType].forEach(option => {
      grades.add(option.등급);
    });
  }
  return Array.from(grades).sort(); // Return unique sorted grades
}

export function getOptionsByGrade(grade: string): Option[] {
  const filteredOptions: Option[] = [];
  for (const slotType in processedProbabilities) {
    processedProbabilities[slotType].forEach(option => {
      if (option.등급 === grade) {
        filteredOptions.push(option);
      }
    });
  }
  // Remove duplicates based on 옵션명, as the same option might appear in different slot types
  const uniqueOptions = Array.from(new Map(filteredOptions.map(item => [item.옵션명, item])).values());
  return uniqueOptions.sort((a, b) => a.옵션명.localeCompare(b.옵션명));
}

export function getOptionsByGradeAndSlotType(grade: string, slotType: string): Option[] {
  const filteredOptions: Option[] = [];
  if (processedProbabilities[slotType]) { // Ensure slotType exists
    processedProbabilities[slotType].forEach(option => {
      if (option.등급 === grade) {
        filteredOptions.push(option);
      }
    });
  }
  return filteredOptions.sort((a, b) => a.옵션명.localeCompare(b.옵션명));
}

export function getOptionsBySlotType(slotType: string): Option[] {
  const filteredOptions: Option[] = [];
  if (processedProbabilities[slotType]) {
    processedProbabilities[slotType].forEach(option => {
      filteredOptions.push(option);
    });
  }
  // Group by option name and find global min/max
  const uniqueOptionsMap = new Map<string, Option>();
  filteredOptions.forEach(opt => {
    const existing = uniqueOptionsMap.get(opt.옵션명);
    if (!existing) {
      uniqueOptionsMap.set(opt.옵션명, { ...opt });
    } else {
      if (opt["수치(최소)"] < existing["수치(최소)"]) existing["수치(최소)"] = opt["수치(최소)"];
      if (opt["수치(최대)"] > existing["수치(최대)"]) {
        existing["수치(최대)"] = opt["수치(최대)"];
        existing.등급 = opt.등급; // Use the grade of the highest max for display
      }
    }
  });
  return Array.from(uniqueOptionsMap.values()).sort((a, b) => a.옵션명.localeCompare(b.옵션명));
}

// Helper function to perform a single gacha roll on an existing GachaState
export function performSingleRoll(currentState: GachaState, currentActiveTabName: TabName): { newState: GachaState; rollSoulCrystals: number; rollKina: number; } {
  const activeTab = currentState.tabs.find(tab => tab.name === currentActiveTabName);
  if (!activeTab) return { newState: currentState, rollSoulCrystals: 0, rollKina: 0 };

  const lockedSlotsCount = activeTab.slots.filter(slot => slot.isLocked).length;
  // If all slots are locked, no roll is performed, and no cost is incurred.
  if (lockedSlotsCount === 9) {
      return { newState: currentState, rollSoulCrystals: 0, rollKina: 0 };
  }

  const cost = GACHA_COSTS[lockedSlotsCount];

  const newSlots = activeTab.slots.map(slot => {
    if (slot.isLocked) {
      return slot;
    } else {
      let slotTypePrefix = (activeTab.name === "특수") ? "특수" : "일반";
      const slotType = `${slotTypePrefix}${slot.id}`;
      const newOption = getRandomOption(slotType);
      return { ...slot, option: newOption };
    }
  });

  const newTabs = currentState.tabs.map(tab =>
    tab.name === currentActiveTabName ? { ...tab, slots: newSlots } : tab
  );

  const newState: GachaState = {
    ...currentState,
    tabs: newTabs,
    totalSoulCrystalsSpent: {
      ...currentState.totalSoulCrystalsSpent,
      [currentActiveTabName]: currentState.totalSoulCrystalsSpent[currentActiveTabName] + cost.soulCrystals
    },
    totalKinaSpent: currentState.totalKinaSpent + cost.kina,
  };

  return {
    newState,
    rollSoulCrystals: cost.soulCrystals,
    rollKina: cost.kina,
  };
}

// Helper function to check if a slot's current option meets any of its targets
export function checkTargetAchieved(slot: Slot): boolean {
  if (!slot.option || !slot.targets || slot.targets.length === 0) {
    return false; // No current option or no targets set
  }

  // Check if current option meets ANY of the targets (OR condition)
  return slot.targets.some(target => {
    // 1. Option name must match
    if (slot.option!.옵션명 !== target.옵션명) {
      return false;
    }

    // 2. If target has a specific value, check if current option's value meets or exceeds it
    if (target.수치 !== undefined && target.수치 !== null) {
      if (slot.option!.수치 === undefined || slot.option!.수치 === null) {
        return false;
      }
      return slot.option!.수치 >= target.수치;
    }

    // 3. If target does not have a specific value, only name and grade need to match
    return slot.option!.등급 === target.등급;
  });
}
