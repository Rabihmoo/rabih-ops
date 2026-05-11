import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { TaskForm, type TaskFormSeed } from '@/components/tasks/TaskForm';
import { toast } from '@/components/ui/toaster';
import { useCreateTask } from '@/hooks/useTasks';
import type { CreateTaskInput, UpdateTaskInput } from '@/lib/tasks';
import type { TaskPriority } from '@/types/database';

const ALLOWED_PRIORITIES: TaskPriority[] = ['urgent', 'normal', 'low'];

function readTaskSeed(params: URLSearchParams): TaskFormSeed {
  const seed: TaskFormSeed = {};
  const title = params.get('title');
  if (title && title.trim()) seed.title = title;
  const desc = params.get('description');
  if (desc && desc.trim()) seed.description = desc;
  const branch = params.get('branch');
  if (branch && branch.trim()) seed.branch = branch;
  const priority = params.get('priority');
  if (priority && (ALLOWED_PRIORITIES as string[]).includes(priority)) {
    seed.priority = priority as TaskPriority;
  }
  const due = params.get('due_date');
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) seed.due_date = due;
  return seed;
}

export function TaskNewPage() {
  const navigate = useNavigate();
  const create = useCreateTask();
  const [searchParams] = useSearchParams();
  const seed = readTaskSeed(searchParams);

  const handleSubmit = async (input: CreateTaskInput | UpdateTaskInput) => {
    const row = await create.mutateAsync(input as CreateTaskInput);
    toast({ title: 'Task created' });
    navigate(`/tasks/${row.id}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/tasks"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to tasks
      </Link>

      <header className="space-y-1">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">New task</h1>
        <p className="text-muted-foreground text-sm">
          Create a new operational task. It will be visible to anyone with access to its
          branch.
        </p>
      </header>

      <Card>
        <CardContent className="p-5">
          <TaskForm
            seed={seed}
            submitting={create.isPending}
            onSubmit={handleSubmit}
            submitLabel="Create task"
          />
        </CardContent>
      </Card>
    </div>
  );
}
