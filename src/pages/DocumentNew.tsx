import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { DocumentForm } from '@/components/documents/DocumentForm';
import { useCreateDocument } from '@/hooks/useDocuments';
import type {
  CreateDocumentInput,
  UpdateDocumentInput,
} from '@/lib/documents';

export function DocumentNewPage() {
  const navigate = useNavigate();
  const create = useCreateDocument();

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
        <CardContent className="space-y-3 p-5">
          <DocumentForm
            submitting={create.isPending}
            onSubmit={handleSubmit}
            submitLabel="Create document"
          />
        </CardContent>
      </Card>
    </div>
  );
}
