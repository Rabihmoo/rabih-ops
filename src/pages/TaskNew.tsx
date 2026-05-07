import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaskForm } from '@/components/tasks/TaskForm';
import { toast } from '@/components/ui/toaster';
import { useCreateTask } from '@/hooks/useTasks';
import type { CreateTaskInput, UpdateTaskInput } from '@/lib/tasks';

export function TaskNewPage() {
  const navigate = useNavigate();
  const create = useCreateTask();

  const handleSubmit = async (input: CreateTaskInput | UpdateTaskInput) => {
    const row = await create.mutateAsync(input as CreateTaskInput);
    toast({ title: 'Task created' });
    navigate(`/tasks/${row.id}`, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Link
        to="/tasks"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to tasks
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">New task</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskForm
            submitting={create.isPending}
            onSubmit={handleSubmit}
            submitLabel="Create task"
          />
        </CardContent>
      </Card>
    </div>
  );
}
