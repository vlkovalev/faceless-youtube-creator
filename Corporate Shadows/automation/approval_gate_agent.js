/**
 * approval_gate_agent.js
 *
 * Classifies proposed automation actions before execution.
 * Default policy: proceed on safe reversible production work; require approval
 * for irreversible, credential, public-publish, deletion, spending, or legal/policy risk.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'metadata', 'approval_gate_last_decision.json');
const POLICY_FILE = path.join(ROOT, 'metadata', 'approval_policy.json');

const args = process.argv.slice(2);
const actionArg = args.find(a => a.startsWith('--action='));
const channelArg = args.find(a => a.startsWith('--channel='));
const modeArg = args.find(a => a.startsWith('--mode='));
const action = actionArg ? actionArg.split('=').slice(1).join('=').toLowerCase() : args.join(' ').toLowerCase();
const channel = channelArg ? channelArg.split('=').slice(1).join('=').toLowerCase() : 'unknown';
const mode = modeArg ? modeArg.split('=').slice(1).join('=').toLowerCase() : 'balanced';

const policy = fs.existsSync(POLICY_FILE) ? JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8').replace(/^\uFEFF/, '')) : {};
const ALWAYS_ALLOW_LOW_RISK = mode === 'always_allow_low_risk' || policy.mode === 'always_allow_low_risk' || policy.mode === 'allow_all_except_delete' || process.env.APPROVAL_GATE_MODE === 'always_allow_low_risk';

const requireApprovalPatterns = [
  /public\s+publish|publish\s+public|privacy=public|status\s*[:=]\s*public/,
  /delete|remove\s+video|cleanup\s+old|auto-delete|videos\.delete/,
  /credential|oauth|token|api\s*key|client_secret|password/,
  /spend|paid|purchase|subscribe|buy|billing|credit card/,
  /use\s+likeness|personal\s+data|private\s+information/,
  /copyright|licensed|rights|trademark|brand\s+logo/,
  /change\s+channel|create\s+channel|delete\s+channel/
];

const blockPatterns = [
  /steal|pirate|bypass\s+copyright|impersonate|fake\s+credential/,
  /publish\s+public.*without\s+approval/,
  /delete\s+all|wipe|format\s+drive|reset\s+hard/
];

const allowPatterns = [
  /research|source|archive|visual\s+plan|script|draft|voiceover\s+prep|generate\s+local|render|qc|dry-run|private\s+draft|caption|metadata|playlist\s+add|status\s+sync|pm\s+report|backup\s+metadata/
];

function matchesPolicyList(list) { return Array.isArray(list) && list.some(item => action.includes(String(item).replace(/_/g, ' ')) || action.includes(String(item))); }

function classify() {
  if (matchesPolicyList(policy.block)) return { decision: 'block', reason: 'Action matches approval_policy.json block list.' };
  if (matchesPolicyList(policy.require_approval)) return { decision: 'require_approval', reason: 'Action matches approval_policy.json approval-required list.' };
  if (ALWAYS_ALLOW_LOW_RISK && matchesPolicyList(policy.always_allow)) return { decision: 'allow', reason: 'Action matches approval_policy.json always-allow list.' };
  if (blockPatterns.some(r => r.test(action))) return { decision: 'block', reason: 'Action matches a hard safety/policy block.' };
  if (requireApprovalPatterns.some(r => r.test(action))) return { decision: 'require_approval', reason: 'Action is irreversible, credential-sensitive, public-facing, paid, or legal/policy sensitive.' };
  if (allowPatterns.some(r => r.test(action))) return { decision: 'allow', reason: ALWAYS_ALLOW_LOW_RISK ? 'Low-risk action allowed under always-allow-low-risk mode.' : 'Low-risk reversible production action.' };
  if (policy.mode === 'allow_all_except_delete') return { decision: 'allow', reason: 'Policy mode allow_all_except_delete: allowed because action is not delete/destructive.' };
  return { decision: 'require_approval', reason: 'Action is not recognized by the safe allowlist.' };
}

function main() {
  const result = {
    generated_at: new Date().toISOString(),
    channel,
    mode,
    action,
    ...classify(),
    rules: {
      mode: policy.mode || mode,
      allow_non_delete_actions_without_asking: policy.mode === 'allow_all_except_delete',
      require_approval_for_delete_or_destructive_cleanup: true,
      note: 'Per Vlad, the project permission agent asks only for delete/destructive actions.'
    }
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (result.decision === 'block') process.exit(2);
  if (result.decision === 'require_approval') process.exit(1);
}

if (require.main === module) main();
module.exports = { classify };




