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
import { Box, Chip, Typography } from '@mui/material';
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

/**
 * Custom hook to fetch standard Kubernetes Events for a node,
 * filtered specifically by NRC taint keys and NodeReadinessRule names to cut out kubelet noise.
 */
function useFilteredNRCEvents(nodeName: string) {
  const [events] = K8s.event.default.useList();

  if (!events) return [];

  return events.filter(event => {
    // Event must be targeted at this specific Node
    const isThisNode =
      event.involvedObject?.kind === 'Node' && event.involvedObject?.name === nodeName;
    if (!isThisNode) return false;

    const message = (event.message || '').toLowerCase();
    const reason = (event.reason || '').toLowerCase();

    // NRC Event filter: check for NRC taints, rule references, or readiness condition changes
    const isNRCEvent =
      message.includes('nrc.x-k8s.io') ||
      message.includes('nodereadiness') ||
      message.includes('node.kubernetes.io/unschedulable') ||
      reason.includes('nodereadiness') ||
      reason.includes('taint') ||
      reason.includes('nrc');

    return isNRCEvent;
  });
}

/**
 * NodeReadinessInjected Component:
 * Injected into Headlamp's standard Node Details view using `registerDetailsViewSection`.
 * Renders a per-condition breakdown table (Required vs Observed) and NRC-filtered taint events.
 */
export function NodeReadinessInjected({ resource }: DetailsViewSectionProps) {
  // Guard clause: Only execute injection when viewing a Node details page
  if (!resource || resource.kind !== 'Node') {
    return null;
  }

  const nodeName = resource.getName();
  const [rules] = NodeReadinessRule.useList();
  const nrcEvents = useFilteredNRCEvents(nodeName);

  if (!rules) {
    return null;
  }

  const conditionRows: ConditionRow[] = [];

  // Iterate across all NodeReadinessRules evaluating this node
  rules.forEach(rule => {
    const evalData: NodeEvaluation | undefined = rule.getEvaluationForNode(nodeName);
    if (!evalData) return;

    const mode = rule.enforcementMode;
    const isDryRun = rule.isDryRun;

    if (evalData.conditions && evalData.conditions.length > 0) {
      evalData.conditions.forEach(cond => {
        const requiredVal = cond.required !== undefined ? String(cond.required) : 'True';
        const observedVal = cond.status || 'Unknown';
        const isMatched = observedVal.toLowerCase() === requiredVal.toLowerCase();

        conditionRows.push({
          ruleName: rule.metadata.name || 'Unknown',
          ruleNamespace: rule.metadata.namespace,
          enforcementMode: mode,
          isDryRun,
          conditionType: cond.type,
          required: requiredVal,
          observed: observedVal,
          status: isDryRun ? 'DryRun' : isMatched ? 'Ready' : 'Held',
        });
      });
    } else {
      const conditionTypes = rule.spec.conditionTypes || ['Ready'];
      conditionTypes.forEach(condType => {
        const reqMap = evalData.requiredConditions || {};
        const obsMap = evalData.observedConditions || {};

        const requiredVal = reqMap[condType] || 'True';
        const observedVal = obsMap[condType] || (evalData.ready ? 'True' : 'False');
        const isMatched = observedVal.toLowerCase() === requiredVal.toLowerCase();

        conditionRows.push({
          ruleName: rule.metadata.name || 'Unknown',
          ruleNamespace: rule.metadata.namespace,
          enforcementMode: mode,
          isDryRun,
          conditionType: condType,
          required: requiredVal,
          observed: observedVal,
          status: isDryRun ? 'DryRun' : isMatched ? 'Ready' : 'Held',
        });
      });
    }
  });

  return (
    <Box sx={{ mt: 2 }}>
      {/* Per-Condition Breakdown Section */}
      <SectionBox title={`Node Readiness Breakdown (${conditionRows.length} Rules Applied)`}>
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

      {/* NRC Filtered Taint & Readiness Events Section */}
      <SectionBox title={`NRC Filtered Events (${nrcEvents.length})`} sx={{ mt: 2 }}>
        {nrcEvents.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No active NRC taint or readiness events recorded for this node.
          </Typography>
        ) : (
          <SimpleTable
            data={nrcEvents}
            columns={[
              {
                label: 'Type',
                getter: ev => (
                  <StatusLabel status={ev.type === 'Warning' ? 'warning' : 'success'}>
                    {ev.type}
                  </StatusLabel>
                ),
              },
              {
                label: 'Reason',
                getter: ev => ev.reason || '-',
              },
              {
                label: 'Message',
                getter: ev => ev.message || '-',
              },
              {
                label: 'Last Seen',
                getter: ev => ev.lastOccurrence || ev.metadata.creationTimestamp || '-',
              },
            ]}
          />
        )}
      </SectionBox>
    </Box>
  );
}
