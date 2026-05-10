import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { DocumentForm } from '@/components/documents/DocumentForm';
import { TemplatePicker } from '@/components/documents/TemplatePicker';
import { useCreateDocument } from '@/hooks/useDocuments';
import type {
  CreateDocumentInput,
  UpdateDocumentInput,
} from '@/lib/documents';
import type { DocumentTemplate } from '@/lib/document-templates';

export function DocumentNewPage() {
  const navigate = useNavigate();
  const create = useCreateDocument();
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);

  const handleSubmit = async (
    payload: CreateDocumentInput | UpdateDocumentInput,
  ) => {
    const row = await create.mutateAsync(payload as CreateDocumentInput);
    toast({ title: 'Document created' });
    navigate(`/documents/${row.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/documents"
        className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to documents
      </Link>
      <h1 className="text-foreground text-3xl font-semibold tracking-tight leading-tight">
        New document
      </h1>

      <Card>
        <CardContent className="p-5">
          <TemplatePicker
            selectedId={template?.id ?? null}
            onSelect={setTemplate}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          {/*
            The `key` forces React to remount DocumentForm whenever the
            chosen template changes, so react-hook-form's defaultValues
            are re-applied without us reaching into its imperative API.
          */}
          <DocumentForm
            key={template?.id ?? 'blank'}
            initialDraft={template?.draft}
            submitting={create.isPending}
            onSubmit={handleSubmit}
            submitLabel="Create document"
          />
        </CardContent>
      </Card>
    </div>
  );
}
