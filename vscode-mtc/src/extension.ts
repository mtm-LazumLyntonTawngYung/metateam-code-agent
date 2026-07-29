import * as vscode from "vscode";
import { WebSocketClient } from "./webSocketClient";
import { SidebarProvider } from "./sidebarProvider";

let client: WebSocketClient | null = null;
let sidebarProvider: SidebarProvider | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration("mtc");
  const host = config.get<string>("serverHost", "127.0.0.1");
  const port = config.get<number>("serverPort", 8080);
  const autoConnect = config.get<boolean>("autoConnect", false);

  client = new WebSocketClient(host, port);

  sidebarProvider = new SidebarProvider(context.extensionUri, client);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider),
  );

  const connectCmd = vscode.commands.registerCommand("mtc.connect", () => {
    client?.connect();
  });

  const disconnectCmd = vscode.commands.registerCommand("mtc.disconnect", () => {
    client?.disconnect();
  });

  const focusSidebarCmd = vscode.commands.registerCommand("mtc.focusSidebar", () => {
    vscode.commands.executeCommand("workbench.view.extension.mtc-sidebar");
  });

  const sendSelectionCmd = vscode.commands.registerCommand("mtc.sendSelection", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage("No active editor");
      return;
    }
    const selection = editor.document.getText(editor.selection);
    if (!selection) {
      vscode.window.showInformationMessage("No text selected");
      return;
    }
    const fileName = editor.document.fileName;
    client?.sendQuery(`/read ${fileName} 1 9999\n\nFocus on this code:\n\`\`\`\n${selection}\n\`\`\``);
    vscode.commands.executeCommand("workbench.view.extension.mtc-sidebar");
  });

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(circle-slash) MTC";
  statusBarItem.tooltip = "MTC Code Agent";
  statusBarItem.command = "mtc.focusSidebar";
  statusBarItem.show();

  if (client) {
    client.on("stateChange", (state: string) => {
      if (state === "connected") {
        statusBarItem.text = "$(check) MTC";
      } else if (state === "connecting") {
        statusBarItem.text = "$(loading~spin) MTC";
      } else {
        statusBarItem.text = "$(circle-slash) MTC";
      }
    });

    client.on("message", (msg) => {
      if (msg.type === "result" && msg.success === false) {
        vscode.window.showErrorMessage(`MTC: ${String(msg.error ?? "Tool failed")}`);
      }
    });
  }

  context.subscriptions.push(
    connectCmd,
    disconnectCmd,
    focusSidebarCmd,
    sendSelectionCmd,
    statusBarItem,
  );

  if (autoConnect && client) {
    setTimeout(() => client!.connect(), 1000);
  }
}

export function deactivate(): void {
  client?.disconnect();
  client = null;
}
