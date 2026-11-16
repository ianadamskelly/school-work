import type { Entry } from './journal';
export const unitSuggestions=['milestones','student submissions','accounts verified','devices serviced','training sessions','lessons','documents reviewed','reports','tasks','people supported'];
export const approvalLabels:Record<string,string>={draft:'Draft',submitted:'Awaiting approval',approved:'Approved','changes-requested':'Changes requested',rejected:'Rejected',legacy:'Existing plan'};
export function approval(o?:Entry){return o?.data.approvalStatus||'legacy';}
export function canWork(o?:Entry){return !!o&&['approved','legacy'].includes(approval(o));}
export function canEditPlan(o?:Entry){return !!o&&['draft','changes-requested','rejected'].includes(approval(o));}
