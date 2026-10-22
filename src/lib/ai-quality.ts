import { ApiError } from "./auth";
import type { Agent } from "./types";

const monthNames = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
type DateMention = {
  iso: string;
  raw: string;
  index: number;
  weekdayConflict: string | null;
};

function validDate(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso
  );
}

/** Resolve explicit years only. A recording's relative weekdays do not imply a calendar date. */
export function explicitSourceDates(source: string): DateMention[] {
  const dates: DateMention[] = [];
  const add = (iso: string, raw: string, index: number) => {
    if (!validDate(iso)) return;
    const previous = source.slice(Math.max(0, index - 20), index);
    const namedDay = previous
      .match(
        /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*,?\s*$/i,
      )?.[1]
      ?.toLowerCase();
    const actualDay = weekdays[new Date(`${iso}T12:00:00Z`).getUTCDay()];
    dates.push({
      iso,
      raw,
      index,
      weekdayConflict:
        namedDay && namedDay !== actualDay
          ? `The source pairs ${namedDay} with ${iso} (${actualDay}). Confirm the intended date.`
          : null,
    });
  };
  for (const match of source.matchAll(/\b(20\d{2}-\d{2}-\d{2})(?=\b|T)/g))
    add(match[1], match[0], match.index);
  for (const match of source.matchAll(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s+(20\d{2})\b/gi,
  )) {
    const month =
      monthNames.findIndex((item) =>
        item.startsWith(match[1].toLowerCase().slice(0, 3)),
      ) + 1;
    add(
      `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`,
      match[0],
      match.index,
    );
  }
  return dates;
}

export function sourceDateClarifications(source: string): string[] {
  const conflicts = explicitSourceDates(source).flatMap((date) =>
    date.weekdayConflict ? [date.weekdayConflict] : [],
  );
  if (
    new Set(explicitSourceDates(source).map((date) => date.iso)).size > 1 &&
    /\b(?:conflicting dates|not sure which|unclear which|either date|dates? (?:conflict|disagree))\b/i.test(
      source,
    )
  ) {
    conflicts.push(
      "The source contains conflicting calendar dates. Confirm the intended date before assigning a deadline.",
    );
  }
  return [...new Set(conflicts)];
}

export function groundedDueDate(
  proposed: string | null,
  quote: string,
  source: string,
): string | null {
  if (
    !proposed ||
    !/^\d{4}-\d{2}-\d{2}$/.test(proposed) ||
    !validDate(proposed)
  )
    return null;
  const relevant = explicitSourceDates(quote);
  if (!relevant.some((date) => date.iso === proposed && !date.weekdayConflict))
    return null;
  if (
    explicitSourceDates(source).some(
      (date) => date.iso === proposed && date.weekdayConflict,
    )
  )
    return null;
  if (
    sourceDateClarifications(source).some((issue) =>
      issue.startsWith("The source contains conflicting"),
    )
  )
    return null;
  if (
    new Set(relevant.map((date) => date.iso)).size > 1 &&
    /\b(?:or|either|maybe|possibly|uncertain|not sure)\b/i.test(quote)
  )
    return null;
  return proposed;
}

/** Reject invented explicit dates and clock times; semantic correctness still needs review. */
export function assertSupportedDates(text: string, source: string) {
  const allowed = new Set(explicitSourceDates(source).map((date) => date.iso));
  for (const date of explicitSourceDates(text)) {
    if (!allowed.has(date.iso))
      throw new ApiError(
        502,
        "The AI draft added a calendar date that is not supported by the source. Please try again.",
        "ungrounded_output",
      );
  }
  const monthDays = (value: string) => {
    const mentions = explicitSourceDates(value).map((date) => date.iso.slice(5));
    for (const match of value.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi)) {
      const month = monthNames.findIndex((item) => item.startsWith(match[1].toLowerCase().slice(0, 3))) + 1;
      mentions.push(`${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`);
    }
    return mentions;
  };
  const sourceDays = new Set(monthDays(source));
  for (const day of monthDays(text)) if (!sourceDays.has(day)) throw new ApiError(502, "The AI draft added a calendar day that is not supported by the source. Please try again.", "ungrounded_output");
  const clockTimes = (value: string) =>
    [
      ...value.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/gi),
    ].map(
      (match) =>
        `${Number(match[1])}:${match[2] ?? "00"}${match[3][0].toLowerCase()}`,
    );
  const sourceTimes = new Set(clockTimes(source));
  for (const time of clockTimes(text))
    if (!sourceTimes.has(time))
      throw new ApiError(
        502,
        "The AI draft added a time that is not supported by the source. Please try again.",
        "ungrounded_output",
      );
  for (const match of text.matchAll(
    /\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|today|tomorrow|tonight|next week)\b/gi,
  )) {
    if (!new RegExp(`\\b${match[0]}\\b`, "i").test(source))
      throw new ApiError(
        502,
        "The AI draft added relative timing that is not supported by the source. Please try again.",
        "ungrounded_output",
      );
  }
}

export function assertNoUnsupportedCompletion(message: string, source: string) {
  const claims = [
    ...message.matchAll(
      /\b(?:i|we)(?:['’]ve| have| had| already| just)?\s+(?:already\s+|just\s+)?(sent|emailed|shared|attached|submitted|updated|delivered)\b/gi,
    ),
  ];
  const passiveClaims = [
    ...message.matchAll(
      /\b(?:checklist|comparison|report|proposal|offer|email|message|document)\s+(?:has been|was|is)\s+(?:already\s+)?(sent|emailed|shared|attached|submitted|updated|delivered)\b/gi,
    ),
  ];
  const positiveSource = source.replace(
    /\b(?:not|never|hasn['’]t|haven['’]t|hadn['’]t|wasn['’]t|weren['’]t)\s+(?:yet\s+)?(?:been\s+)?(?:sent|emailed|shared|attached|submitted|updated|delivered)\b/gi,
    "",
  );
  for (const claim of [...claims, ...passiveClaims]) {
    const action = claim[1].toLowerCase();
    if (
      !new RegExp(
        `\\b(?:i|we|agent)\\s+(?:(?:have|had|already|just)\\s+)*${action}\\b|\\b(?:i|we)['’]ve\\s+(?:already\\s+|just\\s+)?${action}\\b|(?:^|[.!?]\\s+)${action}\\b|\\b(?:checklist|comparison|report|proposal|offer|email|message|document)\\s+(?:has been|was|is)\\s+(?:already\\s+)?${action}\\b`,
        "i",
      ).test(positiveSource)
    ) {
      throw new ApiError(
        502,
        "The draft claimed work was completed without source confirmation. Please try again.",
        "ungrounded_output",
      );
    }
  }
  if (
    /\b(?:i|we)\s+(?:guarantee|promise)\b/i.test(message) &&
    !/\b(?:i|we)\s+(?:guarantee|promise)\b/i.test(source)
  ) {
    throw new ApiError(
      502,
      "The draft introduced a promise that is not in the source. Please try again.",
      "ungrounded_output",
    );
  }
}

export function validateMessageQuality(
  message: string,
  source: string,
  style?: Agent["style"],
) {
  assertSupportedDates(message, source);
  assertNoUnsupportedCompletion(message, source);
  if (
    /\bi hope (?:this|this message|my message) finds you well\b/i.test(message)
  ) {
    throw new ApiError(
      502,
      "The draft used a generic opening. Please try again for a more personal message.",
      "writing_quality",
    );
  }
  const forbidden = (style?.avoid ?? "")
    .split(/[;\n]+/)
    .map((phrase) =>
      phrase
        .trim()
        .replace(/[.!]+$/, "")
        .toLowerCase(),
    )
    .filter((phrase) => phrase.length >= 5 && phrase.length <= 90);
  const normalized = message.toLowerCase().replace(/[’]/g, "'");
  if (
    forbidden.some((phrase) => normalized.includes(phrase.replace(/[’]/g, "'")))
  ) {
    throw new ApiError(
      502,
      "The draft used wording excluded by this agent's style preferences. Please try again.",
      "writing_quality",
    );
  }
}
