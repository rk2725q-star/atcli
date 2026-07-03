import { AgentSkill } from './base';
import { exec } from 'child_process';
import * as os from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD SKILL — Simulate keyboard shortcuts and input (OpenClaw keyboard control)
// ─────────────────────────────────────────────────────────────────────────────
export const KeyboardShortcutSkill: AgentSkill = {
    name: 'keyboard_shortcut',
    description: `Simulates keyboard shortcuts on the host PC (OpenClaw keyboard control).
Uses PowerShell (Windows) or xdotool (Linux/Mac).
Arguments:
  keys (string): key combo e.g. "ctrl+c", "ctrl+shift+p", "win+d", "alt+f4"
  type_text (string, optional): type raw text instead of shortcut`,
    example: `<tool_call>\n{"action": "keyboard_shortcut", "keys": "ctrl+c"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        const platform = process.platform;
        if (args.type_text) {
            const text = args.type_text.replace(/'/g, "\\'");
            if (platform === 'win32') {
                const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${text}')`;
                return new Promise(resolve => exec(`powershell -Command "${script}"`, (e) => resolve(e ? `Error: ${e.message}` : `✅ Typed: ${text.substring(0, 50)}`)));
            }
            return new Promise(resolve => exec(`xdotool type '${text}'`, (e) => resolve(e ? `Error: ${e.message}` : `✅ Typed text`)));
        }
        if (!args.keys) return 'Error: keys or type_text required';
        const keys: string = args.keys;
        if (platform === 'win32') {
            const psKey = keys.replace('ctrl', '^').replace('shift', '+').replace('alt', '%').replace('win', '{LWIN}').replace('+', '');
            const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${psKey}')`;
            return new Promise(resolve => exec(`powershell -Command "${script}"`, (e) => resolve(e ? `Error: ${e.message}` : `✅ Sent: ${keys}`)));
        }
        return new Promise(resolve => exec(`xdotool key ${keys.replace(/\+/g, '+')}`, (e) => resolve(e ? `Error: ${e.message}` : `✅ Sent: ${keys}`)));
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// CLIPBOARD SKILLS — Read and write clipboard (OpenClaw clipboard control)
// ─────────────────────────────────────────────────────────────────────────────
export const ClipboardReadSkill: AgentSkill = {
    name: 'clipboard_read',
    description: `Reads the current contents of the system clipboard. OpenClaw clipboard control.`,
    example: `<tool_call>\n{"action": "clipboard_read"}\n</tool_call>`,
    execute: async (_args: any): Promise<string> => {
        const platform = process.platform;
        return new Promise(resolve => {
            if (platform === 'win32') {
                exec('powershell -Command "Get-Clipboard"', (e, out) =>
                    resolve(e ? `Error: ${e.message}` : `Clipboard: ${out.trim().substring(0, 2000)}`));
            } else if (platform === 'darwin') {
                exec('pbpaste', (e, out) => resolve(e ? `Error: ${e.message}` : `Clipboard: ${out.trim().substring(0, 2000)}`));
            } else {
                exec('xclip -selection clipboard -o', (e, out) => resolve(e ? `Error: ${e.message}` : `Clipboard: ${out.trim().substring(0, 2000)}`));
            }
        });
    },
};

export const ClipboardWriteSkill: AgentSkill = {
    name: 'clipboard_write',
    description: `Writes text to the system clipboard. OpenClaw clipboard control.
Arguments: text (string) — content to copy to clipboard`,
    example: `<tool_call>\n{"action": "clipboard_write", "text": "Hello World"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (!args.text) return 'Error: text is required';
        const text = args.text.replace(/"/g, '\\"');
        const platform = process.platform;
        return new Promise(resolve => {
            if (platform === 'win32') {
                exec(`powershell -Command "Set-Clipboard '${text.replace(/'/g, "''")}'"`,(e) => resolve(e ? `Error: ${e.message}` : `✅ Copied ${args.text.length} chars to clipboard`));
            } else if (platform === 'darwin') {
                const ps = exec('pbcopy', (e) => resolve(e ? `Error: ${e.message}` : `✅ Copied to clipboard`));
                ps.stdin?.write(args.text);
                ps.stdin?.end();
            } else {
                const ps = exec('xclip -selection clipboard', (e) => resolve(e ? `Error: ${e.message}` : `✅ Copied to clipboard`));
                ps.stdin?.write(args.text);
                ps.stdin?.end();
            }
        });
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION SKILL — System notifications (OpenClaw alert system)
// ─────────────────────────────────────────────────────────────────────────────
export const SystemNotifySkill: AgentSkill = {
    name: 'system_notify',
    description: `Sends a system notification (Windows toast, macOS notification, Linux notify-send).
OpenClaw proactive alert capability.
Arguments:
  title (string): notification title
  message (string): notification body
  urgency (string, optional): low/normal/critical (Linux only)`,
    example: `<tool_call>\n{"action": "system_notify", "title": "ATCLI Task Done", "message": "Your deployment is complete!"}\n</tool_call>`,
    execute: async (args: any): Promise<string> => {
        if (!args.title || !args.message) return 'Error: title and message required';
        const title = args.title.replace(/'/g, "''");
        const msg = args.message.replace(/'/g, "''").substring(0, 200);
        const platform = process.platform;
        return new Promise(resolve => {
            let cmd: string;
            if (platform === 'win32') {
                cmd = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(5000, '${title}', '${msg}', [System.Windows.Forms.ToolTipIcon]::Info); Start-Sleep -s 5; $n.Dispose()"`;
            } else if (platform === 'darwin') {
                cmd = `osascript -e 'display notification "${msg}" with title "${title}"'`;
            } else {
                cmd = `notify-send "${title}" "${msg}" --urgency=${args.urgency || 'normal'}`;
            }
            exec(cmd, (e) => resolve(e ? `Error: ${e.message}` : `✅ Notification sent: "${args.title}"`));
        });
    },
};
