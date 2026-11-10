import { describe, expect, it } from "vitest";

import {
  idleMinutesFromSettings,
  idleStatus,
  parseLastActivity,
  secondsLeft,
  warningMs,
} from "@/lib/idle";

const MIN = 60_000;

describe("idleMinutesFromSettings", () => {
  it("lit la valeur configurée", () => {
    expect(idleMinutesFromSettings([{ key: "session_idle_minutes", value: 45 }])).toBe(45);
  });
  it("retombe sur 30 min si le paramètre est absent ou illisible", () => {
    expect(idleMinutesFromSettings(undefined)).toBe(30);
    expect(idleMinutesFromSettings([])).toBe(30);
    expect(idleMinutesFromSettings([{ key: "session_idle_minutes", value: "abc" }])).toBe(30);
    expect(idleMinutesFromSettings([{ key: "session_idle_minutes", value: null }])).toBe(30);
  });
  it("borne la valeur entre 5 et 480 minutes", () => {
    expect(idleMinutesFromSettings([{ key: "session_idle_minutes", value: 1 }])).toBe(5);
    expect(idleMinutesFromSettings([{ key: "session_idle_minutes", value: 9999 }])).toBe(480);
  });
});

describe("idleStatus", () => {
  const idle = 30 * MIN;
  it("est actif, puis averti pendant la dernière minute, puis expiré", () => {
    expect(idleStatus(10 * MIN, 0, idle)).toBe("active");
    expect(idleStatus(29 * MIN - 1, 0, idle)).toBe("active");
    expect(idleStatus(29 * MIN, 0, idle)).toBe("warning");
    expect(idleStatus(30 * MIN - 1, 0, idle)).toBe("warning");
    expect(idleStatus(30 * MIN, 0, idle)).toBe("expired");
  });
  it("traite un long sommeil de l'ordinateur comme une expiration", () => {
    expect(idleStatus(8 * 60 * MIN, 0, idle)).toBe("expired");
  });
  it("limite l'avertissement à la moitié du délai", () => {
    expect(warningMs(10_000)).toBe(5000);
    expect(warningMs(30 * MIN)).toBe(60_000);
  });
});

describe("secondsLeft", () => {
  it("compte à rebours sans passer sous zéro", () => {
    expect(secondsLeft(29 * MIN, 0, 30 * MIN)).toBe(60);
    expect(secondsLeft(30 * MIN - 500, 0, 30 * MIN)).toBe(1);
    expect(secondsLeft(31 * MIN, 0, 30 * MIN)).toBe(0);
  });
});

describe("parseLastActivity", () => {
  it("accepte un horodatage passé", () => {
    expect(parseLastActivity("1000", 5000)).toBe(1000);
  });
  it("ignore une valeur absente, illisible ou dans le futur", () => {
    expect(parseLastActivity(null, 5000)).toBe(5000);
    expect(parseLastActivity("zz", 5000)).toBe(5000);
    expect(parseLastActivity("9000", 5000)).toBe(5000);
  });
});
