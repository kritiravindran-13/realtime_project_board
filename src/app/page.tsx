import { ProjectTasksBoard } from "@/components/project-tasks-board";

export default function Home() {
  return (
    <div className="min-h-full flex-1 bg-zinc-100 dark:bg-zinc-950">
      <ProjectTasksBoard />
    </div>
  );
}
