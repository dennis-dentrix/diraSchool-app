/**
 * Shared React Query hooks for reference data that is fetched on many pages.
 *
 * Rules:
 *  - Canonical query keys live here and nowhere else.
 *  - staleTime is set aggressively because this data changes rarely within a
 *    school term (classes, teachers, subjects) or infrequently (students).
 *  - Each hook normalises the API response so callers always get a plain array.
 *  - prefetchAppData() is called once in the dashboard layout to warm the cache
 *    before any page needs it — pages then read from cache with zero wait.
 */

import { useQuery } from "@tanstack/react-query";
import { classesApi, subjectsApi, studentsApi, usersApi } from "@/lib/api";

// ── Stale-time constants ───────────────────────────────────────────────────────
// Classes and teacher lists change at most once a term.
// Students change when a new enrolment or transfer happens.
const STALE = {
  classes: 20 * 60 * 1000, // 20 min
  teachers: 15 * 60 * 1000, // 15 min
  subjects: 15 * 60 * 1000, // 15 min
  students: 10 * 60 * 1000, // 10 min
};

// ── Raw fetchers (used both by hooks and by prefetchAppData) ──────────────────

const fetchClasses = async () => {
  const res = await classesApi.list({});
  const d = res.data;
  return Array.isArray(d) ? d : (d?.classes ?? d?.data ?? []);
};

const fetchTeachers = async () => {
  const res = await usersApi.list({
    role: "teacher,department_head",
  });
  const d = res.data;
  return Array.isArray(d) ? d : (d?.users ?? d?.data ?? []);
};

const fetchAllSubjects = async () => {
  const res = await subjectsApi.list({});
  const d = res.data;
  return Array.isArray(d) ? d : (d?.subjects ?? d?.data ?? []);
};

const fetchSubjectsByClass = async (classId) => {
  const res = await subjectsApi.list({ classId });
  const d = res.data;
  return Array.isArray(d) ? d : (d?.subjects ?? d?.data ?? []);
};

const fetchStudentsByClass = async (classId) => {
  const res = await studentsApi.list({ classId, status: "active", limit: 1000 });
  const d = res.data;
  return Array.isArray(d) ? d : (d?.students ?? d?.data ?? []);
};

const fetchAllStudents = async () => {
  const res = await studentsApi.list({ status: "active", limit: 1000 });
  const d = res.data;
  return Array.isArray(d) ? d : (d?.students ?? d?.data ?? []);
};

// ── Canonical query keys ───────────────────────────────────────────────────────
export const QUERY_KEYS = {
  classes: ["classes"],
  teachers: ["users", "teachers"],
  allSubjects: ["subjects", "all"],
  subjectsByClass: (classId) => ["subjects", "class", classId],
  studentsByClass: (classId) => ["students", "class", classId],
  allStudents: ["students", "all"],
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** All classes for the school (used in dropdowns across the app). */
export function useClasses() {
  return useQuery({
    queryKey: QUERY_KEYS.classes,
    queryFn: fetchClasses,
    staleTime: STALE.classes,
  });
}

/** All active teachers + department heads. */
export function useTeachers() {
  return useQuery({
    queryKey: QUERY_KEYS.teachers,
    queryFn: fetchTeachers,
    staleTime: STALE.teachers,
  });
}

/** All subjects across the school (timetable, lesson plans). */
export function useAllSubjects() {
  return useQuery({
    queryKey: QUERY_KEYS.allSubjects,
    queryFn: fetchAllSubjects,
    staleTime: STALE.subjects,
  });
}

/** Subjects belonging to a specific class. */
export function useSubjectsByClass(classId) {
  return useQuery({
    queryKey: QUERY_KEYS.subjectsByClass(classId),
    queryFn: () => fetchSubjectsByClass(classId),
    enabled: !!classId,
    staleTime: STALE.subjects,
  });
}

/** Active students in a specific class. */
export function useStudentsByClass(classId) {
  return useQuery({
    queryKey: QUERY_KEYS.studentsByClass(classId),
    queryFn: () => fetchStudentsByClass(classId),
    enabled: !!classId,
    staleTime: STALE.students,
  });
}

/** All active students in the school (fees, transport, report-cards). */
export function useAllStudents() {
  return useQuery({
    queryKey: QUERY_KEYS.allStudents,
    queryFn: fetchAllStudents,
    staleTime: STALE.students,
  });
}

// ── Prefetch helper ────────────────────────────────────────────────────────────
// Call this once in the dashboard layout after the user is confirmed.
// React Query skips the fetch if fresh data is already in cache.

const ADMIN_ROLES = [
  "school_admin",
  "director",
  "headteacher",
  "deputy_headteacher",
];

export function prefetchAppData(queryClient, user) {
  if (!user || user.role === "superadmin" || user.role === "parent") return;

  queryClient.prefetchQuery({
    queryKey: QUERY_KEYS.classes,
    queryFn: fetchClasses,
    staleTime: STALE.classes,
  });

  if (ADMIN_ROLES.includes(user.role)) {
    queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.teachers,
      queryFn: fetchTeachers,
      staleTime: STALE.teachers,
    });
  }
}
