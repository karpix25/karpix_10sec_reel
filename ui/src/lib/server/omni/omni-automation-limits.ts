export type OmniAutomationLimitInput = {
  dailyLimit: number;
  projectLimit: number;
  dailyJobCount: number;
  projectJobCount: number;
  openJobs: number;
  maxBatchPerProject: number;
  maxBacklogPerProject: number;
};

export type OmniAutomationLimitPlan = {
  toEnqueue: number;
  shouldStop: boolean;
  shouldStopAfterQueue: boolean;
  remainingToday: number;
  remainingProject: number;
  backlogRoom: number;
};

function positiveInt(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function planOmniAutomationQueue(input: OmniAutomationLimitInput): OmniAutomationLimitPlan {
  const dailyLimit = positiveInt(input.dailyLimit);
  const projectLimit = positiveInt(input.projectLimit);
  const dailyJobCount = Math.max(0, Math.floor(input.dailyJobCount || 0));
  const projectJobCount = Math.max(0, Math.floor(input.projectJobCount || 0));
  const openJobs = Math.max(0, Math.floor(input.openJobs || 0));
  const maxBatchPerProject = Math.max(1, positiveInt(input.maxBatchPerProject));
  const maxBacklogPerProject = Math.max(1, positiveInt(input.maxBacklogPerProject));

  if (dailyLimit <= 0 || projectLimit <= 0) {
    return {
      toEnqueue: 0,
      shouldStop: false,
      shouldStopAfterQueue: false,
      remainingToday: 0,
      remainingProject: 0,
      backlogRoom: Math.max(0, maxBacklogPerProject - openJobs),
    };
  }

  const remainingToday = Math.max(0, dailyLimit - dailyJobCount);
  const remainingProject = Math.max(0, projectLimit - projectJobCount);
  const backlogRoom = Math.max(0, maxBacklogPerProject - openJobs);
  const shouldStop = remainingProject <= 0;
  const toEnqueue = shouldStop
    ? 0
    : Math.min(maxBatchPerProject, remainingToday, remainingProject, backlogRoom);

  return {
    toEnqueue,
    shouldStop,
    shouldStopAfterQueue: !shouldStop && toEnqueue > 0 && projectJobCount + toEnqueue >= projectLimit,
    remainingToday,
    remainingProject,
    backlogRoom,
  };
}
