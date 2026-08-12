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

import { ResourceListView, StatusLabel } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box, Chip, Typography } from '@mui/material';
import { NodeReadinessRule } from './model';

/**
 * Render enforcement mode semantics:
 * - continuous: Live state (success / green)
 * - bootstrap-only: Initial readiness state (info / blue)
 * - dryRun: Projection / simulation mode (warning / amber)
 */
function renderEnforcementMode(rule: NodeReadinessRule) {
  const mode = rule.enforcementMode;
  const isDryRun = rule.isDryRun;

  if (isDryRun || mode === 'dryRun') {
    return <StatusLabel status="warning">Dry Run (Simulation)</StatusLabel>;
  }

  if (mode === 'continuous') {
    return <StatusLabel status="success">Continuous (Live)</StatusLabel>;
  }

  if (mode === 'bootstrap-only') {
    return (
      <Chip
        label="Bootstrap-Only"
        size="small"
        color="info"
        variant="outlined"
        sx={{ fontWeight: 'medium' }}
      />
    );
  }

  return <Chip label={mode} size="small" variant="outlined" />;
}

/**
 * Cluster-wide RuleListView for NodeReadinessRules.
 * Implements Aggregation over Rendering with O(1) derived counters:
 * Matched, Held, and Bootstrap-Completed.
 */
export function RuleListView() {
  return (
    <ResourceListView
      title="Node Readiness Rules"
      resourceClass={NodeReadinessRule}
      columns={[
        'name',
        'namespace',
        {
          id: 'enforcementMode',
          label: 'Enforcement Mode',
          getValue: (item: NodeReadinessRule) => item.enforcementMode,
          render: (item: NodeReadinessRule) => renderEnforcementMode(item),
        },
        {
          id: 'matchedCount',
          label: 'Matched Nodes',
          getValue: (item: NodeReadinessRule) => item.matchedCount,
          render: (item: NodeReadinessRule) => (
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {item.matchedCount}
            </Typography>
          ),
        },
        {
          id: 'heldCount',
          label: 'Held Nodes',
          getValue: (item: NodeReadinessRule) => item.heldCount,
          render: (item: NodeReadinessRule) => {
            if (item.heldCount === 0) {
              return <Box component="span" sx={{ fontWeight: 'bold' }}>0</Box>;
            }
            if (item.isDryRun) {
              return (
                <Box component="span" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                  {item.heldCount} (Projected)
                </Box>
              );
            }
            return (
              <Box component="span" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                {item.heldCount}
              </Box>
            );
          },
        },
        {
          id: 'completedCount',
          label: 'Bootstrap-Completed',
          getValue: (item: NodeReadinessRule) => item.completedCount,
          render: (item: NodeReadinessRule) => (
            <Box component="span" sx={{ color: 'success.main', fontWeight: 'bold' }}>
              {item.completedCount}
            </Box>
          ),
        },
        'age',
      ]}
    />
  );
}
