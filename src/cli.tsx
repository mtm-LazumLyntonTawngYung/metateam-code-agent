import { render } from "ink";
import { Command } from "commander";
import Home from "./ui/Home";

const program = new Command();

program
  .name("mtc")
  .description("Metateam Code Agent — AI-powered terminal-first coding assistant")
  .version("0.1.0")
  .action(async () => {
    const { waitUntilExit } = render(<Home />);
    await waitUntilExit();
  });

program.parse(process.argv);
