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
        const { execFile } = await import('child_process');
        if (args.type_text) {
            const text = args.type_text;
            if (platform === 'win32') {
                const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${Buffer.from(text).toString('base64')}')))`;
                const encoded = Buffer.from(script, 'utf16le').toString('base64');
                return new Promise(resolve => execFile('powershell', ['-NoProfile', '-EncodedCommand', encoded], (e) => resolve(e ? `Error: ${e.message}` : `✅ Typed: ${text.substring(0, 50)}`)));
            }
            return new Promise(resolve => execFile('xdotool', ['type', text], (e) => resolve(e ? `Error: ${e.message}` : `✅ Typed text`)));
        }
        if (!args.keys) return 'Error: keys or type_text required';
        const keys: string = args.keys;
        if (platform === 'win32') {
            const psKey = keys.replace('ctrl', '^').replace('shift', '+').replace('alt', '%').replace('win', '{LWIN}').replace('+', '');
            const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${psKey}')`;
            const encoded = Buffer.from(script, 'utf16le').toString('base64');
            return new Promise(resolve => execFile('powershell', ['-NoProfile', '-EncodedCommand', encoded], (e) => resolve(e ? `Error: ${e.message}` : `✅ Sent: ${keys}`)));
        }
        return new Promise(resolve => execFile('xdotool', ['key', keys.replace(/\+/g, '+')], (e) => resolve(e ? `Error: ${e.message}` : `✅ Sent: ${keys}`)));
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
        const platform = process.platform;
        const { spawn } = await import('child_process');
        return new Promise(resolve => {
            if (platform === 'win32') {
                const ps = spawn('clip');
                ps.stdin?.write(args.text);
                ps.stdin?.end();
                ps.on('close', (code) => resolve(code === 0 ? `✅ Copied ${args.text.length} chars to clipboard` : `Error: clip.exe exited with ${code}`));
            } else if (platform === 'darwin') {
                const ps = spawn('pbcopy');
                ps.stdin?.write(args.text);
                ps.stdin?.end();
                ps.on('close', (code) => resolve(code === 0 ? `✅ Copied to clipboard` : `Error: pbcopy exited with ${code}`));
            } else {
                const ps = spawn('xclip', ['-selection', 'clipboard']);
                ps.stdin?.write(args.text);
                ps.stdin?.end();
                ps.on('close', (code) => resolve(code === 0 ? `✅ Copied to clipboard` : `Error: xclip exited with ${code}`));
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
        const title = args.title;
        const msg = args.message.substring(0, 200);
        const platform = process.platform;
        const { execFile } = await import('child_process');
        return new Promise(resolve => {
            if (platform === 'win32') {
                const script = `Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(5000, [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${Buffer.from(title).toString('base64')}')), [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${Buffer.from(msg).toString('base64')}')), [System.Windows.Forms.ToolTipIcon]::Info); Start-Sleep -s 5; $n.Dispose()`;
                const encoded = Buffer.from(script, 'utf16le').toString('base64');
                execFile('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], (e) => resolve(e ? `Error: ${e.message}` : `✅ Notification sent`));
            } else if (platform === 'darwin') {
                const safeMsg = msg.replace(/"/g, '\\"');
                const safeTitle = title.replace(/"/g, '\\"');
                execFile('osascript', ['-e', `display notification "${safeMsg}" with title "${safeTitle}"`], (e) => resolve(e ? `Error: ${e.message}` : `✅ Notification sent`));
            } else {
                execFile('notify-send', [title, msg, `--urgency=${args.urgency || 'normal'}`], (e) => resolve(e ? `Error: ${e.message}` : `✅ Notification sent`));
            }
        });
    },
};
