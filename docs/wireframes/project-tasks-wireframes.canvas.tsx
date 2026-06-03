import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CollapsibleSection,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Row,
  Stack,
  Text,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";
import type { CSSProperties, ReactNode } from "react";

type ScreenId = "main" | "selected" | "empty" | "sync";

const SCREENS: { id: ScreenId; label: string }[] = [
  { id: "main", label: "Main board" },
  { id: "selected", label: "Task selected" },
  { id: "empty", label: "Empty states" },
  { id: "sync", label: "Sync flow" },
];

function WireBox({
  label,
  children,
  style,
  dashed,
  accent,
}: {
  label?: string;
  children?: ReactNode;
  style?: CSSProperties;
  dashed?: boolean;
  accent?: boolean;
}) {
  const theme = useHostTheme();
  return (
    <div
      style={{
        border: `1px ${dashed ? "dashed" : "solid"} ${accent ? theme.accent.primary : theme.stroke.secondary}`,
        background: accent ? theme.fill.tertiary : theme.bg.elevated,
        borderRadius: 6,
        padding: 8,
        minHeight: children ? undefined : 28,
        ...style,
      }}
    >
      {label ? (
        <Text size="xs" tone="tertiary" weight="medium" style={{ marginBottom: children ? 6 : 0 }}>
          {label}
        </Text>
      ) : null}
      {children}
    </div>
  );
}

function WireInput({ label, width = "100%" }: { label: string; width?: string | number }) {
  const theme = useHostTheme();
  return (
    <Stack gap={4}>
      <Text size="xs" tone="tertiary">
        {label}
      </Text>
      <div
        style={{
          height: 28,
          width,
          border: `1px solid ${theme.stroke.secondary}`,
          borderRadius: 6,
          background: theme.bg.editor,
        }}
      />
    </Stack>
  );
}

function WireButton({ label, primary, small }: { label: string; primary?: boolean; small?: boolean }) {
  const theme = useHostTheme();
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: small ? 24 : 32,
        padding: small ? "0 8px" : "0 12px",
        borderRadius: 6,
        border: primary ? "none" : `1px solid ${theme.stroke.secondary}`,
        background: primary ? theme.accent.control : theme.bg.elevated,
        color: primary ? theme.text.onAccent : theme.text.secondary,
        fontSize: small ? 11 : 12,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

function TaskCard({ title, selected, deps }: { title: string; selected?: boolean; deps?: number }) {
  return (
    <WireBox accent={selected} style={{ marginBottom: 6 }}>
      <Text size="sm" weight={selected ? "medium" : "normal"}>
        {title}
      </Text>
      {deps ? (
        <Text size="xs" tone="tertiary">
          {deps} dependencies
        </Text>
      ) : null}
    </WireBox>
  );
}

function KanbanColumn({ status, count, cards }: { status: string; count: number; cards: string[] }) {
  const theme = useHostTheme();
  return (
    <WireBox
      style={{ flex: "0 0 140px", minHeight: 180, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <Row justify="space-between" align="center">
        <Text size="xs" weight="medium" tone="secondary">
          {status.toUpperCase()}
        </Text>
        <Text size="xs" tone="tertiary">
          ({count})
        </Text>
      </Row>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {cards.map((c) => (
          <TaskCard key={c} title={c} selected={c === "Bulk task 1"} deps={c === "test task 5" ? 5 : undefined} />
        ))}
      </div>
      <div
        style={{
          borderTop: `1px dashed ${theme.stroke.tertiary}`,
          paddingTop: 6,
          minHeight: 40,
        }}
      >
        <Text size="xs" tone="quaternary">
          drop zone
        </Text>
      </div>
    </WireBox>
  );
}

function ProjectsSidebar({ projectName }: { projectName: string }) {
  return (
    <Stack gap={10}>
      <H3>Projects</H3>
      <Row gap={8} align="start">
        <WireBox style={{ flex: 1 }}>
          <Text size="sm">{projectName}</Text>
          <Text size="xs" tone="tertiary">
            combobox
          </Text>
        </WireBox>
        <WireButton label="Del" small />
      </Row>
      <Text size="xs" tone="tertiary">
        Realtime: connected
      </Text>
      <Divider />
      <WireInput label="Create project" />
      <WireButton label="Add project" primary />
    </Stack>
  );
}

function NewTaskSection() {
  return (
    <WireBox label="New task (undo/redo draft)" dashed style={{ marginBottom: 12 }}>
      <Stack gap={10}>
        <Row gap={6} wrap>
          <WireButton label="Preset: Design API" small />
          <WireButton label="Preset: Wire up UI" small />
          <WireButton label="Undo" small />
          <WireButton label="Redo" small />
        </Row>
        <Grid columns={3} gap={8}>
          <WireInput label="Title" />
          <WireInput label="Status" />
          <WireInput label="Authors" />
        </Grid>
        <Row justify="end">
          <WireButton label="Create task" primary />
        </Row>
      </Stack>
    </WireBox>
  );
}

function BoardSection({ showTasks }: { showTasks: boolean }) {
  return (
    <Stack gap={8}>
      <Row justify="space-between" align="center">
        <H3>Board</H3>
        <Row gap={8}>
          <Text size="xs" tone="tertiary">
            Live updates on
          </Text>
          <WireButton label="Refresh" small />
        </Row>
      </Row>
      {showTasks ? (
        <Row gap={8} style={{ overflowX: "auto", paddingBottom: 4 }}>
          <KanbanColumn status="todo" count={102} cards={["Bulk task 1", "Bulk task 2", "Design API"]} />
          <KanbanColumn status="in_progress" count={3} cards={["Wire up UI"]} />
          <KanbanColumn status="review" count={1} cards={["test task 5"]} />
          <KanbanColumn status="done" count={2} cards={["Ship v1"]} />
        </Row>
      ) : (
        <WireBox dashed>
          <Text size="sm" tone="tertiary">
            No tasks yet. Create one above.
          </Text>
        </WireBox>
      )}
    </Stack>
  );
}

function DetailsPanel({ filled }: { filled: boolean }) {
  if (!filled) {
    return (
      <WireBox dashed style={{ minHeight: 280 }}>
        <Text size="sm" tone="tertiary" style={{ textAlign: "center", padding: 24 }}>
          Select a task on the board to view details, dependencies, and comments.
        </Text>
      </WireBox>
    );
  }

  return (
    <Stack gap={10}>
      <WireInput label="Title" />
      <WireBox label="Authors">
        <Row gap={6} wrap>
          <WireButton label="Jane Doe" small />
          <WireButton label="+ Add" small />
        </Row>
      </WireBox>
      <WireInput label="Status" width="50%" />
      <WireBox label="Dependencies">
        <Row gap={6} wrap>
          <WireButton label="Bulk task 10" small />
          <WireButton label="Bulk task 11" small />
        </Row>
        <Text size="xs" tone="tertiary" style={{ marginTop: 6 }}>
          Save dependencies
        </Text>
      </WireBox>
      <WireBox label="Comments">
        <Stack gap={6}>
          <WireBox style={{ padding: 6 }}>
            <Text size="xs" tone="tertiary">
              Jane · Mar 3, 2:14 PM
            </Text>
            <Text size="sm">Blocked on API review.</Text>
          </WireBox>
          <WireInput label="Your name" />
          <div style={{ height: 48, border: "1px dashed", borderRadius: 6 }} />
          <WireButton label="Post comment" primary small />
        </Stack>
      </WireBox>
      <WireButton label="Delete task" small />
    </Stack>
  );
}

function MainLayoutWireframe({
  projectName,
  showTasks,
  detailsFilled,
}: {
  projectName: string;
  showTasks: boolean;
  detailsFilled: boolean;
}) {
  const theme = useHostTheme();
  return (
    <Stack gap={12}>
      <WireBox style={{ padding: 12 }}>
        <H2>Project tasks</H2>
        <Text size="sm" tone="tertiary">
          Kanban board with drag-and-drop, realtime list, detail panel
        </Text>
      </WireBox>
      <Grid columns="minmax(180px, 220px) 1fr minmax(240px, 280px)" gap={12}>
        <aside style={{ borderRight: `1px solid ${theme.stroke.tertiary}`, paddingRight: 8 }}>
          <ProjectsSidebar projectName={projectName} />
        </aside>
        <main>
          <NewTaskSection />
          <BoardSection showTasks={showTasks} />
        </main>
        <aside style={{ borderLeft: `1px solid ${theme.stroke.tertiary}`, paddingLeft: 8 }}>
          <H3 style={{ marginBottom: 10 }}>Details</H3>
          <DetailsPanel filled={detailsFilled} />
        </aside>
      </Grid>
    </Stack>
  );
}

function EmptyStatesWireframe() {
  const theme = useHostTheme();
  return (
    <Grid columns={2} gap={16}>
      <Card>
        <CardHeader>No project selected</CardHeader>
        <CardBody>
          <Text size="xs" tone="tertiary" style={{ marginBottom: 8 }}>
            First visit or after delete
          </Text>
          <WireBox dashed style={{ minHeight: 120 }}>
            <Text size="sm" tone="tertiary">
              Select a project to view the task board.
            </Text>
          </WireBox>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>Project with zero tasks</CardHeader>
        <CardBody>
          <Text size="xs" tone="tertiary" style={{ marginBottom: 8 }}>
            New project created
          </Text>
          <BoardSection showTasks={false} />
        </CardBody>
      </Card>
      <Card style={{ gridColumn: "1 / -1" }}>
        <CardHeader>Loading / error (board)</CardHeader>
        <CardBody>
          <Row gap={16}>
            <Text size="sm" tone="tertiary">
              Loading tasks…
            </Text>
            <Text size="sm" tone="tertiary" style={{ color: theme.text.primary }}>
              Failed to load tasks (refetch via Refresh)
            </Text>
          </Row>
        </CardBody>
      </Card>
    </Grid>
  );
}

function SyncFlowWireframe() {
  const theme = useHostTheme();
  const boxStyle: CSSProperties = {
    padding: 10,
    borderRadius: 6,
    border: `1px solid ${theme.stroke.secondary}`,
    background: theme.bg.elevated,
    textAlign: "center",
    minWidth: 120,
  };
  const arrow = (
    <Text size="xs" tone="tertiary" style={{ padding: "0 4px" }}>
      →
    </Text>
  );

  return (
    <Stack gap={16}>
      <Text size="sm" tone="secondary">
        Data flow when a user creates or updates a task (per projectId channel)
      </Text>
      <Row gap={4} align="center" wrap justify="center">
        <div style={boxStyle}>
          <Text size="xs" weight="medium">
            Browser
          </Text>
          <Text size="xs" tone="tertiary">
            REST POST/PATCH
          </Text>
        </div>
        {arrow}
        <div style={boxStyle}>
          <Text size="xs" weight="medium">
            API route
          </Text>
          <Text size="xs" tone="tertiary">
            Prisma → DB
          </Text>
        </div>
        {arrow}
        <div style={boxStyle}>
          <Text size="xs" weight="medium">
            publishTaskEvent
          </Text>
          <Text size="xs" tone="tertiary">
            RealtimeMessage
          </Text>
        </div>
        {arrow}
        <div style={{ ...boxStyle, borderStyle: "dashed" }}>
          <Text size="xs" weight="medium">
            Redis (optional)
          </Text>
          <Text size="xs" tone="tertiary">
            pub/sub fanout
          </Text>
        </div>
        {arrow}
        <div style={boxStyle}>
          <Text size="xs" weight="medium">
            WebSocket
          </Text>
          <Text size="xs" tone="tertiary">
            project subscribers
          </Text>
        </div>
        {arrow}
        <div style={boxStyle}>
          <Text size="xs" weight="medium">
            TanStack Query
          </Text>
          <Text size="xs" tone="tertiary">
            merge / invalidate
          </Text>
        </div>
      </Row>
      <Grid columns={2} gap={12}>
        <CollapsibleSection title="WebSocket subscribe (multi-project)">
          <Stack gap={6}>
            <Text size="sm" tone="secondary">
              One socket per active projectId. Client sends subscribe / unsubscribe; server maps
              projectId → sockets. Events never cross projects.
            </Text>
            <WireBox dashed>
              <Text size="xs" tone="tertiary">
                {`{ "type": "subscribe", "projectId": "…" }`}
              </Text>
            </WireBox>
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Client cache strategy">
          <Stack gap={6}>
            <Text size="sm" tone="secondary">
              Task events merge into ["tasks", projectId]. Comment/project events invalidate. Ambiguous
              merge → refetch GET /api/tasks.
            </Text>
          </Stack>
        </CollapsibleSection>
      </Grid>
    </Stack>
  );
}

function Annotations() {
  return (
    <CollapsibleSection title="Wireframe notes">
      <Stack gap={8}>
        <Text size="sm" tone="secondary">
          Layout: 3-column grid on lg+ (Projects ~220px | Board flex | Details ~280px). Center column
          stacks New task form above horizontal Kanban columns. Columns virtualize after 50 cards.
        </Text>
        <Text size="sm" tone="secondary">
          Interactions: drag task card → column (PATCH status); click card → Details; dependency chips
          navigate between tasks.
        </Text>
      </Stack>
    </CollapsibleSection>
  );
}

export default function ProjectTasksWireframes() {
  const [screen, setScreen] = useCanvasState<ScreenId>("wireframe-screen", "main");

  return (
    <Stack gap={20} style={{ padding: 16, maxWidth: 1100 }}>
      <Stack gap={6}>
        <H1>Project tasks — wireframes</H1>
        <Text size="sm" tone="tertiary">
          Low-fidelity layouts matching src/components/project-tasks-board.tsx and related panels
        </Text>
      </Stack>

      <Row gap={8} wrap>
        {SCREENS.map((s) => (
          <Button
            key={s.id}
            variant={screen === s.id ? "primary" : "secondary"}
            onClick={() => setScreen(s.id)}
          >
            {s.label}
          </Button>
        ))}
      </Row>

      {screen === "main" ? (
        <MainLayoutWireframe projectName="My project" showTasks detailsFilled={false} />
      ) : null}
      {screen === "selected" ? (
        <MainLayoutWireframe projectName="My project" showTasks detailsFilled />
      ) : null}
      {screen === "empty" ? <EmptyStatesWireframe /> : null}
      {screen === "sync" ? <SyncFlowWireframe /> : null}

      <Annotations />
    </Stack>
  );
}
