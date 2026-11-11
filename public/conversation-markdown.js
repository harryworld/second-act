import MarkdownIt from "./vendor/markdown-it-15.0.3.js";
import { esc, rich } from "./ui.js";

const markdown = new MarkdownIt("commonmark", { html: false, linkify: true });
markdown.enable("linkify");
markdown.linkify.set({ fuzzyLink: false, fuzzyEmail: false });
markdown.validateLink = (href) => /^https?:\/\//i.test(href) && URL.canParse(href);

markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return renderer.renderToken(tokens, index, options);
};

// Keep image descriptions in the reply without fetching remote media.
markdown.renderer.rules.image = (tokens, index, options, env, renderer) =>
  esc(renderer.renderInlineAsText(tokens[index].children, options, env));

// The conversation title already occupies the page's h1.
const heading = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  token.tag = "h" + Math.min(6, Number(token.tag.slice(1)) + 1);
  return renderer.renderToken(tokens, index, options);
};
markdown.renderer.rules.heading_open = heading;
markdown.renderer.rules.heading_close = heading;

export function conversationMessageBody(message) {
  if (message.role === "assistant" && !message.voiceRun) {
    return `<div class="guide-markdown">${markdown.render(message.text ?? "")}</div>`;
  }
  return `<p class="chat-text">${rich(message.text)}</p>`;
}
