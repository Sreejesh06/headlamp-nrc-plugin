import { K8s } from '@kinvolk/headlamp-plugin/lib';
import {
  Link,
  SectionBox,
  SimpleTable,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { DetailsViewSectionProps } from '@kinvolk/headlamp-plugin/lib/plugin/registry';
import { Alert, AlertTitle, Box, Chip, Typography } from '@mui/material';
import { NodeEvaluation, NodeReadinessRule } from './model';
import { useNodeReadinessMap } from './hooks/useNodeReadinessMap';

interface ConditionRow {
  ruleName: string;
  ruleNamespace?: string;
  enforcementMode: string;
  isDryRun: boolean;
  conditionType: string;
  required: string;
  observed: string;
  status: 'Ready' | 'Held' | 'DryRun' | 'Unknown';
}

interface FailingRuleSummary {
  ruleName: string;
  ruleNamespace?: string;
  conditionType: string;
  required: string;
  observed: string;
  taintKey: string;
  isTimedOut: boolean;
}

/**
 * Hook to fetch Pending workload pods impacted by this unschedulable/held node.
 */
function useImpactedPendingPods(nodeName: string) {
  const [pods, error] = K8s.ResourceClasses.Pod.useList();
  if (!pods) return [];

  return pods.filter(pod => {
    if (pod.status?.phase !== 'Pending') return false;
    if (pod.spec?.nodeName === nodeName) return true;

    const scheduledCondition = pod.status?.conditions?.find((c: any) => c.type === 'PodScheduled');
    const podMessage = (scheduledCondition?.message || '').toLowerCase();
    const podReason = (scheduledCondition?.reason || '').toLowerCase();

    return (
      podMessage.includes('node(s) had untolerated taint') ||
      podMessage.includes('unschedulable') ||
      podReason.includes('unschedulable')
    );
  });
}

/**
 * NodeReadinessInjected Component:
 * Injected into Headlamp's standard Node Details view using `registerDetailsViewSection`.
 */
export function NodeReadinessInjected({ resource }: DetailsViewSectionProps) {
  if (!resource || resource.kind !== 'Node') {
    return null;
  }

  const nodeName = resource.getName();
  const { nodeImpactMap, error, isLoading, rules } = useNodeReadinessMap();
  const pendingPods = useImpactedPendingPods(nodeName);

  if (error) {
    return (
      <Box sx={{ mt: 2 }}>
        <Alert severity="error">
          <AlertTitle>Error loading NodeReadinessRules</AlertTitle>
          {error.message || String(error)}
        </Alert>
      </Box>
    );
  }

  if (isLoading || !rules) {
    return null; 
  }

  const impact = nodeImpactMap.get(nodeName);
  const conditionRows: ConditionRow[] = [];
  const failingRulesSummary: FailingRuleSummary[] = [];
  let hasStalledTimeout = false;

  rules.forEach(rule => {
    const evalData: NodeEvaluation | undefined = rule.getEvaluationForNode(nodeName);
    if (!evalData) return;

    const mode = rule.enforcementMode;
    const isDryRun = rule.isDryRun;
    const isTimedOut = rule.isNodeTimedOut(nodeName);

    if (isTimedOut) {
      hasStalledTimeout = true;
    }

    const processCondition = (
      type: string,
      reqVal: string,
      obsVal: string,
      isMatched: boolean
    ) => {
      const statusStr = isDryRun ? 'DryRun' : isMatched ? 'Ready' : 'Held';

      if (!isMatched && !isDryRun) {
        failingRulesSummary.push({
          ruleName: rule.metadata.name || 'Unknown',
          ruleNamespace: rule.metadata.namespace,
          conditionType: type,
          required: reqVal,
          observed: obsVal,
          taintKey: rule.spec.taint?.key || 'nrc.x-k8s.io/unschedulable',
          isTimedOut,
        });
      }

      conditionRows.push({
        ruleName: rule.metadata.name || 'Unknown',
        ruleNamespace: rule.metadata.namespace,
        enforcementMode: mode,
        isDryRun,
        conditionType: type,
        required: reqVal,
        observed: obsVal,
        status: statusStr,
      });
    };

    if (evalData.conditions && evalData.conditions.length > 0) {
      evalData.conditions.forEach(cond => {
        const requiredVal = cond.required !== undefined ? String(cond.required) : 'False';
        const observedVal = cond.status || 'Unknown';
        const isMatched = observedVal.toLowerCase() === requiredVal.toLowerCase();
        processCondition(cond.type, requiredVal, observedVal, isMatched);
      });
    } else {
      const conditionTypes = rule.spec.conditionTypes || ['Ready'];
      conditionTypes.forEach(condType => {
        const reqMap = evalData.requiredConditions || {};
        const obsMap = evalData.observedConditions || {};

        const requiredVal = reqMap[condType] || 'False';
        const observedVal = obsMap[condType] || (evalData.ready ? 'False' : 'True');
        const isMatched = observedVal.toLowerCase() === requiredVal.toLowerCase();
        processCondition(condType, requiredVal, observedVal, isMatched);
      });
    }
  });

  const renderBanner = () => {
    if (!impact || (!impact.isHeld && !impact.isDryRunHeld)) {
      return (
        <Alert severity="success" sx={{ mb: 4 }}>
          <AlertTitle sx={{ fontWeight: 'bold' }}>
            Node Readiness Verified - Accepting Workloads
          </AlertTitle>
          All active NodeReadinessRule condition checks are satisfied. No NRC taints active.
        </Alert>
      );
    }

    if (impact.isHeld) {
      const isBootstrapOnly = Array.from(impact.enforcementModes).every(m => m === 'bootstrap-only');
      const severity = isBootstrapOnly ? 'info' : 'error';
      const title = isBootstrapOnly 
        ? 'Node Pending Initial Bootstrap Readiness' 
        : 'Node is Tainted & Unscheduleable (Not Accepting Workloads)';

      return (
        <Alert severity={severity} sx={{ mb: 4 }}>
          <AlertTitle sx={{ fontWeight: 'bold' }}>
            {title}
          </AlertTitle>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {failingRulesSummary.map((fail, i) => (
              <li key={i}>
                <strong>Failing Rule:</strong>{' '}
                <Link
                  routeName={NodeReadinessRule.detailsRoute}
                  params={{ namespace: fail.ruleNamespace || 'default', name: fail.ruleName }}
                >
                  {fail.ruleName}
                </Link>{' '}
                | Condition <strong>{fail.conditionType}</strong> is {fail.observed} (Expected:{' '}
                {fail.required}).
                {fail.isTimedOut && (
                  <strong style={{ color: 'orange', marginLeft: '5px' }}>[TIMED OUT]</strong>
                )}
                <Box sx={{ mt: 1, mb: 1 }}>
                  <Chip
                    label={`Taint: ${fail.taintKey}:NoSchedule`}
                    size="small"
                    color={severity}
                    variant="outlined"
                    sx={{ fontFamily: 'monospace' }}
                  />
                </Box>
              </li>
            ))}
          </ul>
        </Alert>
      );
    }

    if (impact.isDryRunHeld) {
      return (
        <Alert severity="warning" sx={{ mb: 4 }}>
          <AlertTitle sx={{ fontWeight: 'bold' }}>
            Simulation: Node Would Be Tainted (Dry-Run Mode)
          </AlertTitle>
          This node is currently failing one or more rules running in Dry-Run mode. If these rules were actively enforcing, this node would be tainted and unscheduleable.
          <ul style={{ margin: 0, paddingLeft: '20px', marginTop: '10px' }}>
            {impact.dryRunBy.map((rule, i) => (
              <li key={i}>
                <strong>Projected Failing Rule:</strong>{' '}
                <Link
                  routeName={NodeReadinessRule.detailsRoute}
                  params={{ namespace: rule.metadata.namespace || 'default', name: rule.metadata.name }}
                >
                  {rule.metadata.name}
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      );
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      {renderBanner()}

      {hasStalledTimeout && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle sx={{ fontWeight: 'bold' }}>
            ⚠️ Bootstrap Stalled - Exceeded Rule Timeout
          </AlertTitle>
          One or more readiness rules have held this node longer than specified <code>timeoutSeconds</code>. Check node daemonsets and driver installation scripts.
        </Alert>
      )}

      <SectionBox title={`Node Readiness Breakdown (${conditionRows.length} Condition Rules)`}>
        {conditionRows.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No NodeReadinessRules are currently evaluating this node.
          </Typography>
        ) : (
          <SimpleTable
            data={conditionRows}
            columns={[
              {
                label: 'Rule Name',
                getter: row => (
                  <Link
                    routeName={NodeReadinessRule.detailsRoute}
                    params={{ name: row.ruleName, namespace: row.ruleNamespace || 'default' }}
                  >
                    {row.ruleName}
                  </Link>
                ),
              },
              {
                label: 'Enforcement Mode',
                getter: row =>
                  row.isDryRun ? (
                    <StatusLabel status="warning">DryRun</StatusLabel>
                  ) : (
                    <Chip label={row.enforcementMode} size="small" variant="outlined" />
                  ),
              },
              {
                label: 'Condition Type',
                getter: row => row.conditionType,
              },
              {
                label: 'Required',
                getter: row => row.required,
              },
              {
                label: 'Observed',
                getter: row => row.observed,
              },
              {
                label: 'State',
                getter: row => {
                  if (row.status === 'Ready') {
                    return <StatusLabel status="success">Satisfied (Ready)</StatusLabel>;
                  }
                  if (row.status === 'Held') {
                    return <StatusLabel status="error">Held (Tainted)</StatusLabel>;
                  }
                  return <StatusLabel status="warning">Projection (DryRun)</StatusLabel>;
                },
              },
            ]}
          />
        )}
      </SectionBox>

      <SectionBox title={`Impacted Pending Workloads (${pendingPods.length})`} sx={{ mt: 2 }}>
        {pendingPods.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No pending workload pods currently blocked by this node's readiness state.
          </Typography>
        ) : (
          <SimpleTable
            data={pendingPods}
            columns={[
              {
                label: 'Pod Name',
                getter: pod => (
                  <Link routeName="pod" params={{ name: pod.getName(), namespace: pod.getNamespace() }}>
                    {pod.getName()}
                  </Link>
                ),
              },
              {
                label: 'Namespace',
                getter: pod => pod.getNamespace(),
              },
              {
                label: 'Status Reason',
                getter: pod => (
                  <StatusLabel status="warning">
                    {pod.status?.reason || 'Unschedulable'}
                  </StatusLabel>
                ),
              },
              {
                label: 'Age',
                getter: pod => pod.getAge() || '-',
              },
            ]}
          />
        )}
      </SectionBox>
    </Box>
  );
}

/**
 * A tiny cell component injected into the main Headlamp Nodes list view.
 * Utilizes the shared memoized useNodeReadinessMap hook so per-row rendering is O(1)
 * instead of causing a full rule set iteration per node.
 */
export function NodeListNRCStatus({ node }: { node: any }) {
  const { nodeImpactMap, error, isLoading } = useNodeReadinessMap();
  
  if (error || isLoading) {
    return <span style={{ opacity: 0.5 }}>-</span>;
  }

  const impact = nodeImpactMap.get(node.metadata.name);

  if (!impact || (!impact.isHeld && !impact.isDryRunHeld)) {
    return (
      <Chip 
        label="Passed" 
        size="small" 
        color="success" 
        variant="outlined" 
      />
    );
  }

  if (impact.isHeld) {
    const isBootstrapOnly = Array.from(impact.enforcementModes).every(m => m === 'bootstrap-only');
    
    if (isBootstrapOnly) {
      return (
        <Chip 
          label="Pending (Bootstrap)" 
          size="small" 
          color="info" 
          sx={{ fontWeight: 'bold' }} 
        />
      );
    }

    return (
      <Chip 
        label="Tainted (NRC)" 
        size="small" 
        color="error" 
        sx={{ fontWeight: 'bold' }} 
      />
    );
  }

  if (impact.isDryRunHeld) {
    return (
      <Chip 
        label="Projected Taint" 
        size="small" 
        color="warning" 
        sx={{ fontWeight: 'bold' }} 
      />
    );
  }

  return null;
}

