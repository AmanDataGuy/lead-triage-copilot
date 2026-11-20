/**
 * # seed-leads.ts - the sample leads every new visitor starts with (all people and numbers are fictional)
 *
 * - A deliberate mix: hot, warm, cold, an impossible budget and a spam lead; English, Hinglish and a chat transcript.
 * - minutesAgo sets each lead's age when it is copied into a workspace, so two hot leads show live 5-minute timers.
 * - build-seed.ts runs these through the real AI pipeline once and writes src/lib/seed.json.
 */
import type { LeadInput } from "@/lib/validation";

export const SEED_LEADS: { minutesAgo: number; lead: LeadInput }[] = [
  {
    minutesAgo: 3,
    lead: {
      name: "Rohit Verma",
      phone: "+91 98450 12345",
      location: "Whitefield, Bengaluru",
      requirement: "2BHK, east-facing, ready to move",
      budget: "₹80-90 lakh",
      timeline: "Within 1 month",
      message:
        "Hi, mera rent agreement 31 March ko khatam ho raha hai so jaldi shift karna hai. SBI se 70L loan pre-approved hai. Whitefield mein 2BHK east facing chahiye, ready to move. Kya is Saturday site visit ho sakta hai? Wife bhi aayegi. Price sheet WhatsApp kar do pls.",
    },
  },
  {
    minutesAgo: 40,
    lead: {
      name: "Priya Nair",
      phone: "+91 99001 23456",
      location: "Sarjapur Road, Bengaluru",
      requirement: "3BHK, 1500+ sq ft, good school nearby",
      budget: "₹1.4-1.6 Cr",
      timeline: "1-3 months",
      message:
        "We're relocating from Chennai, my husband joins a company on Sarjapur Road on 15 Jan. Need a 3BHK ready or near-ready; the kids' school admission is in Feb so we need to close soon. About 40% will come from selling our Chennai flat, the rest a home loan. Can you share availability on higher floors and the all-inclusive cost? We can visit next weekend.",
    },
  },
  {
    minutesAgo: 180,
    lead: {
      name: "Lakshmi Subramanian",
      phone: "+91 97400 55667",
      location: "Devanahalli, near Bengaluru airport",
      requirement: "3BHK villa, ready to move",
      budget: "₹1.2 Cr (can stretch to 1.25)",
      timeline: "Immediately",
      message:
        "My colleague Ramesh bought in your Phase 1. We saw the villa at plot 34 last Sunday and liked it. Funds are ready (FD maturing plus HDFC loan sanctioned). Only issue: you quoted 1.32 Cr all-inclusive. If you can come to 1.22 with car parking included, I can pay the token this Friday. Please confirm with your manager.",
    },
  },
  {
    minutesAgo: 26 * 60,
    lead: {
      name: "Arjun Mehta (NRI, Dubai)",
      phone: "",
      location: "Hebbal, Bengaluru",
      requirement: "2BHK for investment / rental income",
      budget: "₹90 lakh - 1 Cr",
      timeline: "3-6 months",
      message:
        "Looking for an investment 2BHK near Manyata Tech Park. What's the expected rental yield and the RERA registration number? I'm based in Dubai; my father in Bengaluru can do the site visit. Is an NRI home loan possible with your partner banks?",
    },
  },
  {
    minutesAgo: 300,
    lead: {
      name: "Sandeep Arora",
      phone: "+91 98860 77889",
      location: "Thanisandra, Bengaluru",
      requirement: "3BHK + study, gated society",
      budget: "₹1.8-2 Cr",
      timeline: "1-3 months",
      message:
        "Lead: possession date kya hai is project ka?\nAgent: RERA possession Dec 2028 hai sir.\nLead: 2028?? bahut late hai. pichle builder ne 3 saal delay kiya tha, ab trust nahi hota\nLead: koi ready to move option hai same budget mein?\nLead: aur wife ko bhi dikhana padega, weekend pe hi aa sakte hain",
    },
  },
  {
    minutesAgo: 2 * 24 * 60,
    lead: {
      name: "Vikram Reddy",
      phone: "",
      location: "Hyderabad, anywhere good",
      requirement: "Flat",
      budget: "Not sure",
      timeline: "Just exploring",
      message: "Just checking prices. Abhi plan nahi hai, maybe next year. Send brochure.",
    },
  },
  {
    minutesAgo: 20 * 60,
    lead: {
      name: "Farhan Shaikh",
      phone: "",
      location: "Bandra West, Mumbai",
      requirement: "3BHK sea-facing, new building",
      budget: "₹80 lakh",
      timeline: "Within 1 month",
      message: "Need sea facing 3bhk in Bandra west, max 80 lakh. Ready to move fast if price is right.",
    },
  },
  {
    minutesAgo: 600,
    lead: {
      name: "test test",
      phone: "",
      location: "asdf",
      requirement: "asdfgh",
      budget: "1",
      timeline: "Just exploring",
      message:
        "Hello sir we provide SEO and Google ranking services for your real estate website, first page guaranteed. Call us for a free audit.",
    },
  },
];
