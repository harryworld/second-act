import assert from "node:assert/strict";
import { test } from "node:test";
import { conversationMessageBody } from "../public/conversation-markdown.js";

test("guide replies render semantic blocks, inline formatting, and links", () => {
  const message = Object.freeze({
    role: "assistant",
    text: [
      "# Trial plan", "", "## First week", "",
      "1. **Ask** a *maker*.", "   - Bring `samples`.", "2. Compare quotes.", "",
      "[Guide](https://example.org/guide) or https://example.org/visit.", "",
      "```html", "<p>Sample</p>", "```",
    ].join("\n"),
  });
  const html = conversationMessageBody(message);
  assert.match(html, /<h2>Trial plan<\/h2>\s*<h3>First week<\/h3>/);
  assert.match(html, /<ol>\s*<li><strong>Ask<\/strong> a <em>maker<\/em>\.\s*<ul>\s*<li>Bring <code>samples<\/code>/);
  assert.match(html, /href="https:\/\/example.org\/guide"[^>]*>Guide<\/a>/);
  assert.match(html, /href="https:\/\/example.org\/visit"[^>]*>https:\/\/example.org\/visit<\/a>\./);
  assert.match(html, /<pre><code[^>]*>&lt;p&gt;Sample&lt;\/p&gt;\n<\/code><\/pre>/);
});

test("raw HTML stays visible as text and only HTTP(S) links become active", () => {
  const html = conversationMessageBody({
    role: "assistant",
    text: '<button data-act="menu">Menu</button>\n\n[A](javascript:noop) [B](data:text/plain,hello) [C](//example.org) [D](#profile) [E](https://example.org) ![sketch](https://example.org/sketch.jpg)',
  });
  assert.match(html, /&lt;button data-act=&quot;menu&quot;&gt;Menu&lt;\/button&gt;/);
  assert.doesNotMatch(html, /<(button|img)\b/);
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ["https://example.org"]);
  assert.match(html, /rel="noopener noreferrer">E<\/a> sketch/);
});

test("member messages and saved voice transcripts preserve literal wording and URL links", () => {
  for (const props of [{ role: "user" }, { role: "assistant", voiceRun: "run-1" }]) {
    const html = conversationMessageBody({ ...props, text: "**spoken** <b>text</b> https://example.org" });
    assert.match(html, /^<p class="chat-text">\*\*spoken\*\* &lt;b&gt;text&lt;\/b&gt; <a /);
  }
});
