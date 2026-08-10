export function processCommand(command: string): {
  action: string;
  url?: string;
  isBrowserAction: boolean;
} {
  const lowerCmd = command.toLowerCase().trim();

  // Social media shortcuts
  const social: { names: string[]; url: string; label: string }[] = [
    { names: ["instagram"], url: "https://www.instagram.com", label: "Instagram" },
    { names: ["twitter", "x twitter"], url: "https://twitter.com", label: "Twitter" },
    { names: ["telegram"], url: "https://web.telegram.org", label: "Telegram" },
    { names: ["facebook", "fb"], url: "https://www.facebook.com", label: "Facebook" },
    { names: ["github"], url: "https://github.com", label: "GitHub" },
    { names: ["whatsapp"], url: "https://web.whatsapp.com", label: "WhatsApp" },
    { names: ["youtube"], url: "https://www.youtube.com", label: "YouTube" },
    { names: ["spotify"], url: "https://open.spotify.com", label: "Spotify" },
    { names: ["gmail", "mail"], url: "https://mail.google.com", label: "Gmail" },
    { names: ["google"], url: "https://www.google.com", label: "Google" },
    { names: ["hotstar"], url: "https://www.hotstar.com", label: "Hotstar" },
    { names: ["netflix"], url: "https://www.netflix.com", label: "Netflix" },
    { names: ["amazon"], url: "https://www.amazon.in", label: "Amazon" },
  ];

  for (const s of social) {
    for (const name of s.names) {
      const re = new RegExp(`^(open|launch|kholo|khol)\\s+(the\\s+)?${name}$`);
      if (re.test(lowerCmd)) {
        return {
          action: `Opening ${s.label} for you. Ab time pass shuru! 😏`,
          url: s.url,
          isBrowserAction: true,
        };
      }
    }
  }

  // General Browsing: "Open [website name]"
  const openMatch = lowerCmd.match(/^(open|launch|kholo)\s+(.+)$/);
  if (openMatch) {
    let website = openMatch[2].trim().replace(/^the\s+/, "").replace(/\s+/g, "");
    if (!website.includes(".")) {
      website += ".com";
    }
    return {
      action: `Opening ${openMatch[2]} for you. Ugh, always making me work! 🙄`,
      url: `https://www.${website}`,
      isBrowserAction: true,
    };
  }

  // Google Search: "Google [query]" or "Search for [query]" or "Search [query]"
  const googleMatch = lowerCmd.match(/^(?:google|search for|search|dhoondo)\s+(.+)$/);
  if (googleMatch && !lowerCmd.includes("on spotify") && !lowerCmd.includes("on youtube")) {
    const query = encodeURIComponent(googleMatch[1].trim());
    return {
      action: `Searching "${googleMatch[1]}" on Google. Mere dimaag se jyada tez internet hai! ⚡`,
      url: `https://www.google.com/search?q=${query}`,
      isBrowserAction: true,
    };
  }

  // Media Search: "Play [song/video] on YouTube"
  const ytMatch = lowerCmd.match(/^(play|chalao|bajao)\s+(.+?)\s+on\s+youtube$/);
  if (ytMatch) {
    const query = encodeURIComponent(ytMatch[2].trim());
    return {
      action: `Playing ${ytMatch[2]} on YouTube. Don't judge my music taste! 🎵`,
      url: `https://www.youtube.com/results?search_query=${query}`,
      isBrowserAction: true,
    };
  }

  // Media Search: "Search [query] on Spotify"
  const spotifyMatch = lowerCmd.match(/^search\s+(.+?)\s+on\s+spotify$/);
  if (spotifyMatch) {
    const query = encodeURIComponent(spotifyMatch[1].trim());
    return {
      action: `Searching ${spotifyMatch[1]} on Spotify. Hope it's a banger! 🎧`,
      url: `https://open.spotify.com/search/${query}`,
      isBrowserAction: true,
    };
  }

  // WhatsApp Web: "Send a WhatsApp message to [number] saying [message]"
  const waMatch = lowerCmd.match(
    /^send\s+a\s+whatsapp\s+message\s+to\s+([\d\+\s]+)\s+saying\s+(.+)$/,
  );
  if (waMatch) {
    const number = waMatch[1].replace(/\s+/g, "");
    const message = encodeURIComponent(waMatch[2].trim());
    return {
      action: `Sending your message on WhatsApp. Let's hope they reply! 😅`,
      url: `https://web.whatsapp.com/send?phone=${number}&text=${message}`,
      isBrowserAction: true,
    };
  }

  return { action: "", isBrowserAction: false };
}
