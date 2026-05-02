import { CURRENT_YEAR, TERMS } from '@/lib/constants';

const toIsoDate = (value) => String(value ?? '').slice(0, 10);

export function getCurrentTermFromSettings(settings, fallback = TERMS[0]) {
  const terms = Array.isArray(settings?.terms) ? settings.terms : [];
  const todayIso = new Date().toISOString().slice(0, 10);

  const activeTerm = terms.find((term) => {
    const start = toIsoDate(term?.startDate);
    const end = toIsoDate(term?.endDate);
    return start && end && todayIso >= start && todayIso <= end;
  });

  return activeTerm?.name ?? terms.find((term) => TERMS.includes(term?.name))?.name ?? fallback;
}

export function getCurrentAcademicYearFromSettings(settings, fallback = String(CURRENT_YEAR)) {
  return settings?.currentAcademicYear ?? fallback;
}

export function getSchoolTermDefaults(settings) {
  return {
    academicYear: getCurrentAcademicYearFromSettings(settings),
    term: getCurrentTermFromSettings(settings),
  };
}
