import {
  DetailsGrid,
  Link,
  NameValueTable,
  SectionBox,
  SimpleTable,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Chip, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { NodeReadinessRule } from '../resources/nodeReadinessRule';

export function NodeReadinessRuleDetail() {
  const { name, namespace } = useParams<{ name: string; namespace: string }>();

  return (
    <DetailsGrid
      resourceType={NodeReadinessRule}
      name={name || ''}
      namespace={namespace}
      withEvents
      extraInfo={(item: NodeReadinessRule) => [
        {
          name: 'Enforcement Mode',
          value: (
            <Chip
              label={item.enforcementMode}
              size="small"
              color={
                item.enforcementMode === 'Enforced' || item.enforcementMode === 'Enforcing'
                  ? 'primary'
                  : item.enforcementMode === 'Audit'
                  ? 'warning'
                  : 'default'
              }
              variant="outlined"
            />
          ),
        },
        {
          name: 'Timeout (seconds)',
          value:
            item.spec.timeoutSeconds !== undefined
              ? `${item.spec.timeoutSeconds}s`
              : 'Default',
        },
      ]}
      extraSections={(item: NodeReadinessRule) => {
        const evaluatedNodes = item.evaluatedNodes;

        return [
          {
            id: 'nrc-rule-spec',
            section: (
              <SectionBox title="Spec Configuration">
                <NameValueTable
                  rows={[
                    {
                      name: 'Enforcement Mode',
                      value: item.spec.enforcementMode || 'Not Specified',
                    },
                    {
                      name: 'Condition Types',
                      value: item.spec.conditionTypes?.length
                        ? item.spec.conditionTypes.join(', ')
                        : 'None Specified',
                    },
                    {
                      name: 'Node Selector',
                      value: item.spec.nodeSelector
                        ? Object.entries(item.spec.nodeSelector)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(', ')
                        : 'All Nodes',
                    },
                    {
                      name: 'Timeout Seconds',
                      value: item.spec.timeoutSeconds?.toString() || 'Default',
                    },
                  ]}
                />
              </SectionBox>
            ),
          },
          {
            id: 'nrc-evaluated-nodes',
            section: (
              <SectionBox title={`Evaluated Nodes (${evaluatedNodes.length})`}>
                {evaluatedNodes.length === 0 ? (
                  <Typography variant="body2" color="textSecondary">
                    No nodes currently evaluated by this rule.
                  </Typography>
                ) : (
                  <SimpleTable
                    data={evaluatedNodes}
                    columns={[
                      {
                        label: 'Node Name',
                        getter: node => (
                          <Link routeName="node" params={{ name: node.name }}>
                            {node.name}
                          </Link>
                        ),
                      },
                      {
                        label: 'Status',
                        getter: node => (
                          <Chip
                            label={node.status || 'Evaluated'}
                            size="small"
                            color={
                              node.status === 'Ready'
                                ? 'success'
                                : node.status === 'Not Ready'
                                ? 'error'
                                : 'default'
                            }
                          />
                        ),
                      },
                      {
                        label: 'Message',
                        getter: node => node.message || '-',
                      },
                    ]}
                  />
                )}
              </SectionBox>
            ),
          },
        ];
      }}
    />
  );
}
