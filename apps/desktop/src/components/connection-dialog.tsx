import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateConnectionProfileSchema,
  type CreateConnectionProfileInput,
  type ConnectionProfile,
} from "@kamehadb/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateConnection,
  useTestConnection,
  useUpdateConnection,
} from "@/hooks/use-connections";
import { Loader2, Plug, Plus } from "lucide-react";

interface ConnectionDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  editConnection?: ConnectionProfile | null;
}

export function ConnectionDialog({
  open,
  onOpenChange,
  editConnection,
}: ConnectionDialogProps) {
  const isEditing = !!editConnection;
  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();
  const testConnection = useTestConnection();

  const form = useForm<CreateConnectionProfileInput>({
    resolver: zodResolver(CreateConnectionProfileSchema) as any,
    defaultValues: {
      name: editConnection?.name ?? "",
      kind: editConnection?.kind ?? "postgres",
      host: editConnection?.host ?? "localhost",
      port: editConnection?.port ?? 5432,
      database: editConnection?.database ?? "",
      username: editConnection?.username ?? "",
      ssl: editConnection?.ssl ?? false,
    },
  });

  const kind = form.watch("kind");

  async function handleTest() {
    const values = form.getValues();
    await testConnection.mutateAsync(values);
  }

  async function handleSubmit(values: CreateConnectionProfileInput) {
    if (isEditing) {
      await updateConnection.mutateAsync({
        id: editConnection.id,
        input: values,
      });
    } else {
      await createConnection.mutateAsync(values);
    }
    onOpenChange?.(false);
    form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="size-3.5" />
        New
      </DialogTrigger>
      <DialogContent className="sm:max-w-120">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Connection" : "New Connection"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              {...form.register("name")}
              placeholder="My Database"
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={kind}
              onValueChange={(v) => {
                form.setValue(
                  "kind",
                  v as CreateConnectionProfileInput["kind"]
                );
                if (v === "sqlite") {
                  form.setValue("host", undefined);
                  form.setValue("port", undefined);
                } else {
                  form.setValue("filePath", undefined);
                }
              }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="postgres">PostgreSQL</SelectItem>
                <SelectItem value="sqlite">SQLite</SelectItem>
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="redis">Redis</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind !== "sqlite" ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="host">Host</Label>
                  <Input
                    id="host"
                    {...form.register("host")}
                    placeholder="localhost"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    {...form.register("port", { valueAsNumber: true })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="database">Database</Label>
                <Input
                  id="database"
                  {...form.register("database")}
                  placeholder="mydb"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  {...form.register("username")}
                  placeholder="postgres"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">
                  Password{" "}
                  {kind === "postgres" && (
                    <span className="text-destructive">*</span>
                  )}
                </Label>
                <Input
                  id="password"
                  type="password"
                  onChange={(e) => form.setValue("password", e.target.value)}
                  placeholder={isEditing ? "(unchanged)" : ""}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="filePath">File Path</Label>
              <Input
                id="filePath"
                {...form.register("filePath")}
                placeholder="/path/to/database.sqlite"
              />
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testConnection.isPending}>
              {testConnection.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plug className="size-3.5" />
              )}
              Test Connection
            </Button>
            {testConnection.data && (
              <span
                className={`text-xs ${
                  testConnection.data.success
                    ? "text-green-600"
                    : "text-red-600"
                }`}>
                {testConnection.data.success
                  ? `Connected (${testConnection.data.serverVersion ?? "ok"})`
                  : testConnection.data.message}
              </span>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange?.(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              disabled={
                createConnection.isPending || updateConnection.isPending
              }>
              {(createConnection.isPending || updateConnection.isPending) && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {isEditing ? "Update" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
