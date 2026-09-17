import { expect, it } from "vitest";
import { youtubeId } from "./video";
it("accepts share/watch/shorts/embed and rejects untrusted iframe sources", () => {
  for (const url of [
    "https://youtu.be/M7lc1UVf-VE?si=abc",
    "https://www.youtube.com/watch?v=M7lc1UVf-VE",
    "https://youtube.com/shorts/M7lc1UVf-VE",
    "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE",
  ])
    expect(youtubeId(url)).toBe("M7lc1UVf-VE");
  for (const url of [
    "javascript:alert(1)",
    "https://youtube.com.evil.com/watch?v=M7lc1UVf-VE",
    "https://youtube.com@evil.com/watch?v=M7lc1UVf-VE",
    "https://youtu.be/invalid",
    '<iframe src="https://youtube.com"></iframe>',
  ])
    expect(youtubeId(url)).toBeNull();
});
