/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
    // Pod must be in Pending phase
    if (pod.status?.phase !== 'Pending') return false;

    // Direct node targeting or nodeName match
    if (pod.spec?.nodeName === nodeName) return true;

    // Check if pod status message references NRC taint or unschedulable node
    // Note: This data lives inside the 'PodScheduled' condition
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
 * Provides a deep diagnostic answer to: "Why is this node not accepting workloads?"
 */
export function NodeReadinessInjected({ resource }: DetailsViewSectionProps) {
  if (!resource || resource.kind !== 'Node') {
    return null;
  }

  const nodeName = resource.getName();
  const [rules, error] = NodeReadinessRule.useList();
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

  if (!rules) {
    return null; // Keep null here to prevent flashing Loading on fast networks, or change to typography if debugging is needed
  }

  const conditionRows: ConditionRow[] = [];
  const failingRulesSummary: FailingRuleSummary[] = [];
  let isNodeHeld = false;
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
        isNodeHeld = true;
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

  return (
    <Box sx={{ mt: 2 }}>
      {/* Top Root-Cause Diagnostic Alert Banner */}
      {isNodeHeld ? (
        <Alert severity="error" sx={{ mb: 4 }}>
          <AlertTitle sx={{ fontWeight: 'bold' }}>
            Node is Tainted & Unscheduleable (Not Accepting Workloads)
          </AlertTitle>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {failingRulesSummary.map((fail, i) => (
              <li key={i}>
                <strong>Failing Rule:</strong>{' '}
                <Link
                  routeName="NodeReadinessRules"
                  params={{ namespace: fail.ruleNamespace, name: fail.ruleName }}
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
                    color="error"
                    variant="outlined"
                    sx={{ fontFamily: 'monospace' }}
                  />
                </Box>
              </li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert severity="success" sx={{ mb: 4 }}>
          <AlertTitle sx={{ fontWeight: 'bold' }}>
            Node Readiness Verified - Accepting Workloads
          </AlertTitle>
          All active NodeReadinessRule condition checks are satisfied. No NRC taints active.
        </Alert>
      )}

      {/* ⚠️ Stalled Bootstrap Timeout Warning Alert */}
      {hasStalledTimeout && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle sx={{ fontWeight: 'bold' }}>
            ⚠️ Bootstrap Stalled - Exceeded Rule Timeout
          </AlertTitle>
          One or more readiness rules have held this node longer than specified <code>timeoutSeconds</code>. Check node daemonsets and driver installation scripts.
        </Alert>
      )}

      {/* Per-Condition Breakdown Table Section */}
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

      {/* 📦 Impacted Pending Workloads Section */}
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
 * A tiny cell component injected into the main Headlamp Nodes list view
 * to show high-level NRC status without having to click into the node.
 */
export function NodeListNRCStatus({ node }: { node: any }) {
  const [rules, error] = NodeReadinessRule.useList();
  
  if (error || !rules) {
    return <span style={{ opacity: 0.5 }}>-</span>;
  }

  let isHeld = false;
  
  rules.forEach(rule => {
    const evaluation = rule.status?.nodeEvaluations?.find(
      (ev: any) => ev.nodeName === node.metadata.name
    );
    if (evaluation?.held) {
      isHeld = true;
    }
  });

  if (isHeld) {
    return (
      <Chip 
        label="Tainted (NRC)" 
        size="small" 
        color="error" 
        sx={{ fontWeight: 'bold' }} 
      />
    );
  }
  
  return (
    <Chip 
      label="Passed" 
      size="small" 
      color="success" 
      variant="outlined" 
    />
  );
}

