import { render, renderToString } from "ink";
import { Command } from "commander";
import App from "./ui/App";

const program = new Command();

program
  .name("mtc")
  .description("Metateam Code Agent — AI-powered terminal-first coding assistant")
  .version("1.0.0")
  .action(async () => {
    if (process.stdin.isTTY) {
      const { waitUntilExit } = render(<App />);
      await waitUntilExit();
    } else {
      const output = renderToString(<App />, { columns: 80 });
      console.log(output);
    }
  });

program.parse(process.argv);
