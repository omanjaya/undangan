/**
 * Kamus label tetap pada halaman tamu. Nilai berupa HTML statis tepercaya
 * (hanya <br> dan <em>), jadi aman dipasang lewat innerHTML. Konten milik
 * pasangan (nama, cerita, alamat) tidak pernah lewat kamus ini.
 */
export type Lang = "id" | "en";

export const labels = {
  "cover.invite": { id: "UNDANGAN", en: "INVITATION TO THE" },
  "cover.guest": {
    id: "KEPADA YTH. BAPAK / IBU / SAHABAT",
    en: "DEAR HONORED GUEST",
  },
  "guest.default": { id: "Tamu undangan", en: "Dear guest" },
  "cover.open": { id: "Buka undangan", en: "Open invitation" },
  "cover.note": {
    id: "Dengan bahagia, kami mengundang Anda.",
    en: "With joy, we invite you.",
  },
  "music.play": { id: "Putar musik", en: "Play music" },
  "music.pause": { id: "Jeda musik", en: "Pause music" },
  "nav.label": { id: "Navigasi undangan", en: "Invitation navigation" },
  "nav.couple": { id: "Mempelai", en: "Couple" },
  "nav.event": { id: "Acara", en: "Event" },
  "nav.moments": { id: "Momen", en: "Moments" },
  "nav.gift": { id: "Hadiah", en: "Gift" },
  "nav.rsvp": { id: "Konfirmasi hadir", en: "RSVP" },
  "hero.eyebrow": { id: "PAWIWAHAN · BALI", en: "WEDDING · BALI" },
  "hero.cta": { id: "Lihat detail acara", en: "View event details" },
  "hero.footnote": {
    id: "Bersama, dalam doa dan restu.",
    en: "Together, with your prayers and blessings.",
  },
  "hero.promise": {
    id: "SEBUAH JANJI, SELAMANYA",
    en: "A PROMISE, FOREVER",
  },
  "hero.side": {
    id: "DENGAN RESTU KELUARGA &amp; ORANG TERKASIH",
    en: "WITH THE BLESSING OF FAMILY &amp; LOVED ONES",
  },
  "hero.scroll": { id: "SCROLL TO DISCOVER", en: "SCROLL TO DISCOVER" },
  "intro.eyebrow": {
    id: "DENGAN PENUH RASA SYUKUR",
    en: "WITH GRATEFUL HEARTS",
  },
  "couple.groom": { id: "MEMPELAI PRIA", en: "THE GROOM" },
  "couple.bride": { id: "MEMPELAI WANITA", en: "THE BRIDE" },
  "couple.note": {
    id: "Merupakan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir dan memberikan doa restu.",
    en: "It would be our joy to have you join us and share your blessings.",
  },
  "verse.eyebrow": { id: "DALAM KESATUAN HATI", en: "IN UNITY OF HEARTS" },
  "verse.meaning": {
    id: "Semoga niat kalian sejalan, hati kalian selaras, dan pikiran kalian bersatu, agar kalian hidup bersama dalam kerukunan.",
    en: "May your intentions be aligned, your hearts in harmony, and your minds united, so that you may live together in concord.",
  },
  "verse.label": {
    id: "Terjemahan bebas Indonesia",
    en: "Free English translation",
  },
  "verse.source": { id: "· Baca sumber", en: "· Read the source" },
  "event.eyebrow": { id: "SAVE THE DATE", en: "SAVE THE DATE" },
  "event.title": {
    id: "Hari yang<br>kami <em>nantikan.</em>",
    en: "The day<br>we have <em>waited for.</em>",
  },
  "event.lead": {
    id: "Sebuah awal yang indah menjadi semakin berarti dengan kehadiran orang-orang terkasih.",
    en: "A beautiful beginning means even more with our loved ones beside us.",
  },
  "countdown.label": {
    id: "Hitung mundur menuju pernikahan",
    en: "Countdown to the wedding",
  },
  "countdown.days": { id: "HARI", en: "DAYS" },
  "countdown.hours": { id: "JAM", en: "HOURS" },
  "countdown.minutes": { id: "MENIT", en: "MINUTES" },
  "countdown.done": {
    id: "Hari istimewa telah tiba. Terima kasih atas doa dan cinta Anda.",
    en: "The special day has arrived. Thank you for your prayers and love.",
  },
  "event.calendar": { id: "Simpan di kalender", en: "Add to calendar" },
  "event.live": {
    id: "Saksikan secara langsung",
    en: "Watch the live stream",
  },
  "event.dress": { id: "Dress code", en: "Dress code" },
  "time.untilEnd": { id: "— selesai", en: "— until finished" },
  "card.kicker": { id: "Rangkaian acara", en: "Event" },
  "card.venue": { id: "Lokasi acara", en: "Venue" },
  "card.open": { id: "Buka lokasi", en: "Open location" },
  "card.mapExact": {
    id: "Pin lokasi yang dibagikan tuan rumah.",
    en: "Location pin shared by the hosts.",
  },
  "card.mapApprox": {
    id: "Pratinjau perkiraan berdasarkan alamat. Gunakan tombol Buka lokasi untuk menuju pin yang dibagikan tuan rumah.",
    en: "Approximate preview based on the address. Use the Open location button to reach the pin shared by the hosts.",
  },
  "story.photo": { id: "CERITA KAMI, SELAMANYA", en: "OUR STORY, FOREVER" },
  "story.eyebrow": { id: "AWAL DARI SELAMANYA", en: "THE START OF FOREVER" },
  "story.title": {
    id: "Semesta punya<br><em>cara yang indah.</em>",
    en: "The universe has<br><em>a beautiful way.</em>",
  },
  "gallery.eyebrow": {
    id: "POTONGAN CERITA KAMI",
    en: "GLIMPSES OF OUR STORY",
  },
  "gallery.title": {
    id: "Untuk <em>dikenang.</em>",
    en: "To be <em>remembered.</em>",
  },
  "gallery.lead": {
    id: "Kenangan yang tinggal selamanya.",
    en: "Memories that stay forever.",
  },
  "gift.eyebrow": { id: "TANDA KASIH", en: "A TOKEN OF LOVE" },
  "gift.title": {
    id: "Amplop <em>digital.</em>",
    en: "Digital <em>gift.</em>",
  },
  "gift.lead": {
    id: "Doa restu Anda sudah sangat berarti bagi kami. Jika ingin berbagi tanda kasih, Anda dapat mengirimkannya melalui informasi berikut.",
    en: "Your blessings already mean the world to us. Should you wish to share a gift, you may send it through the details below.",
  },
  "gift.accountName": { id: "a.n.", en: "Account name" },
  "gift.copy": { id: "Salin", en: "Copy" },
  "gift.copied": { id: "Tersalin", en: "Copied" },
  "gift.copyFailed": {
    id: "Gagal menyalin. Salin nomor secara manual.",
    en: "Could not copy. Please copy the number manually.",
  },
  "gift.qris": { id: "Pindai QRIS", en: "Scan QRIS" },
  "gift.shipping": { id: "Kirim hadiah fisik", en: "Send a physical gift" },
  "gift.recipient": { id: "Penerima", en: "Recipient" },
  "gift.address": { id: "Alamat", en: "Address" },
  "rsvp.eyebrow": {
    id: "KEHADIRAN ANDA BEGITU BERARTI",
    en: "YOUR PRESENCE MEANS SO MUCH",
  },
  "rsvp.title": {
    id: "Sampai jumpa<br><em>di hari bahagia.</em>",
    en: "See you<br><em>on our happy day.</em>",
  },
  "rsvp.lead": {
    id: "Kehadiran dan doa Anda adalah hadiah terindah bagi kami. Kabari kami jika Anda dapat merayakan hari ini bersama.",
    en: "Your presence and prayers are the most beautiful gift to us. Let us know if you can celebrate this day with us.",
  },
  "rsvp.previewTitle": {
    id: "Konfirmasi kehadiran",
    en: "Confirm attendance",
  },
  "rsvp.previewNote": {
    id: "Formulir RSVP tersedia untuk tamu setelah undangan dipublikasikan.",
    en: "The RSVP form is available to guests once the invitation is published.",
  },
  "form.kicker": { id: "Balasan Anda", en: "Your reply" },
  "form.title": { id: "Konfirmasi kehadiran", en: "Confirm attendance" },
  "form.name": { id: "Nama lengkap", en: "Full name" },
  "form.namePlaceholder": {
    id: "Tuliskan nama Anda",
    en: "Write your name",
  },
  "form.attendance": { id: "Konfirmasi kehadiran", en: "Attendance" },
  "form.attending": {
    id: "Dengan senang hati, hadir",
    en: "Gladly attending",
  },
  "form.declined": { id: "Maaf, belum bisa hadir", en: "Sorry, cannot attend" },
  "form.count": { id: "Jumlah tamu", en: "Number of guests" },
  "form.count1": { id: "1 orang", en: "1 guest" },
  "form.count2": { id: "2 orang", en: "2 guests" },
  "form.count3": { id: "3 orang", en: "3 guests" },
  "form.count4": { id: "4 orang", en: "4 guests" },
  "form.count5": { id: "5 orang", en: "5 guests" },
  "form.message": { id: "Doa &amp; ucapan", en: "Wishes &amp; message" },
  "form.optional": { id: "(opsional)", en: "(optional)" },
  "form.messagePlaceholder": {
    id: "Bagikan doa dan harapan hangat Anda…",
    en: "Share your warm prayers and wishes…",
  },
  "form.note": {
    id: "Ucapan akan ditampilkan setelah disetujui oleh pasangan. Konfirmasi dapat diperbarui dari browser yang sama.",
    en: "Messages appear once approved by the couple. Your reply can be updated from the same browser.",
  },
  "form.submit": { id: "Kirim konfirmasi", en: "Send reply" },
  "form.update": { id: "Perbarui konfirmasi", en: "Update reply" },
  "form.sending": { id: "Mengirim konfirmasi…", en: "Sending your reply…" },
  "form.savedDeclined": {
    id: "Konfirmasi tersimpan. Terima kasih sudah memberi kabar.",
    en: "Reply saved. Thank you for letting us know.",
  },
  "form.savedAttending": {
    id: "Konfirmasi tersimpan — kehadiran {n} orang tercatat.",
    en: "Reply saved — {n} guest(s) recorded.",
  },
  "form.failed": {
    id: "Konfirmasi belum tersimpan. Silakan coba kembali.",
    en: "Your reply was not saved. Please try again.",
  },
  "form.offline": {
    id: "Tidak dapat terhubung. Silakan coba kembali.",
    en: "Unable to connect. Please try again.",
  },
  "wishes.eyebrow": {
    id: "DOA DARI ORANG TERKASIH",
    en: "WISHES FROM LOVED ONES",
  },
  "wishes.title": {
    id: "Titipan <em>doa &amp; cinta.</em>",
    en: "Prayers <em>&amp; love.</em>",
  },
  "wishes.loading": {
    id: "Memuat doa dan ucapan…",
    en: "Loading wishes…",
  },
  "wishes.empty": {
    id: "Jadilah yang pertama menitipkan doa untuk perjalanan kami.",
    en: "Be the first to leave a prayer for our journey.",
  },
  "wishes.error": {
    id: "Ucapan belum dapat dimuat. Silakan muat ulang halaman.",
    en: "Wishes could not be loaded. Please reload the page.",
  },
  "footer.eyebrow": { id: "DENGAN SEGENAP CINTA", en: "WITH ALL OUR LOVE" },
  "footer.thanks": {
    id: "Terima kasih telah menjadi bagian dari cerita kami.",
    en: "Thank you for being part of our story.",
  },
  "footer.credit": {
    id: "Dibuat dengan sepenuh hati · Temu",
    en: "Made with love · Temu",
  },
  "branding.made": { id: "Dibuat dengan Temu", en: "Made with Temu" },
  "branding.cta": { id: "Buat undanganmu", en: "Create yours" },
  "mobile.label": { id: "Navigasi cepat", en: "Quick navigation" },
  "mobile.location": { id: "Lokasi", en: "Location" },
  "mobile.calendar": { id: "Kalender", en: "Calendar" },
  "mobile.rsvp": { id: "RSVP", en: "RSVP" },
  "lang.label": { id: "Pilih bahasa", en: "Choose language" },
} as const;

export type LabelKey = keyof typeof labels;

/** Teks Indonesia (bawaan) untuk dirender di server. */
export const t = (key: LabelKey): string => labels[key].id;
