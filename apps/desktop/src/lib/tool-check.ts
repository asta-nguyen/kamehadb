import { invokeTauri } from '@/lib/tauri';

export type ToolInstallCheck = {
  readonly installed: boolean;
  readonly path: string | null;
  readonly hint: string;
};

export async function checkToolInstalled(program: string): Promise<ToolInstallCheck> {
  return invokeTauri<ToolInstallCheck>('check_tool_installed', { program });
}
