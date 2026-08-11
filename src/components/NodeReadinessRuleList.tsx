import { ResourceListView } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Chip } from '@mui/material';
import { NodeReadinessRule } from '../resources/nodeReadinessRule';

export function NodeReadinessRuleList() {
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
          render: (item: NodeReadinessRule) => {
            const mode = item.enforcementMode;
            const color =
              mode === 'Enforced' || mode === 'Enforcing'
                ? 'primary'
                : mode === 'Audit'
                ? 'warning'
                : 'default';
            return <Chip label={mode} size="small" color={color} variant="outlined" />;
          },
        },
        'age',
      ]}
    />
  );
}
