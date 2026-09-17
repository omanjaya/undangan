import type { InvitationContent } from "./invitation";

/** Derive display content without changing the owner's saved media selections. */
export function presentationContent(
  content: InvitationContent,
): InvitationContent {
  if (content.photoMode !== "illustrated") return content;
  return {
    ...content,
    heroPhoto: "",
    bridePhoto: "",
    groomPhoto: "",
    storyPhoto: "",
    galleryPhotos: [],
  };
}
