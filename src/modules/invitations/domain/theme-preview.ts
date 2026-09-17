import {
  contentSchema,
  demoContent,
  type InvitationContent,
} from "./invitation";
export function themePreviewContent(
  themeId: InvitationContent["theme"],
  mode: InvitationContent["photoMode"] = "photos",
) {
  return contentSchema.parse({
    ...demoContent,
    theme: themeId,
    fontPreset: themeId === "puri-emerald" ? "cinzel" : "cormorant",
    bride: "Ayu",
    groom: "Wira",
    brideFullName: "Ni Putu Ayu Pradnyani",
    groomFullName: "I Made Wira Pratama",
    brideParents: "Putri dari Bapak I Wayan Pradnyana & Ibu Ni Made Sari",
    groomParents: "Putra dari Bapak I Ketut Dharma & Ibu Ni Nyoman Dewi",
    brideAddress: "Denpasar, Bali",
    groomAddress: "Gianyar, Bali",
    opening:
      "Dengan memohon restu Ida Sang Hyang Widhi Wasa, kami mengundang Bapak, Ibu, dan Saudara untuk hadir memberikan doa restu dalam perayaan Pawiwahan kami.",
    photoMode: mode,
    illustrationSlideshow: mode === "illustrated",
    heroPhoto: "",
    galleryPhotos: [],
    storyPhoto: "",
    bridePhoto: "",
    groomPhoto: "",
    musicUrl: "",
    videoUrl: "",
  });
}
