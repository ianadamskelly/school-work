import type { Entry } from './journal';
export const unitSuggestions=['milestones','student submissions','accounts verified','devices serviced','training sessions','lessons','documents reviewed','reports','tasks','people supported'];
// The deployed Principal's account ID is stable across email and profile changes.
export const principalAccountId = 'principal_pending';
export const noApprovalRequired = 'approval-not-required';
export const approvalLabels:Record<string,string>={draft:'Draft',submitted:'Awaiting approval',approved:'Approved','changes-requested':'Changes requested',rejected:'Rejected',legacy:'Existing plan',[noApprovalRequired]:'Ready to work'};
export function approval(o?:Entry){return o?.data.approvalStatus||'legacy';}
export function canWork(o?:Entry){return !!o&&['approved','legacy',noApprovalRequired].includes(approval(o));}
export function canEditPlan(o?:Entry){return !!o&&['draft','changes-requested','rejected',noApprovalRequired].includes(approval(o));}
