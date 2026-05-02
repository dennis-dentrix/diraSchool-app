export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/login", "/register"],
        disallow: [
          "/dashboard",
          "/billing",
          "/students",
          "/staff",
          "/classes",
          "/fees",
          "/attendance",
          "/exams",
          "/results",
          "/report-cards",
          "/subjects",
          "/timetable",
          "/transport",
          "/audit-logs",
          "/settings",
          "/portal",
          "/superadmin",
          "/verify-email",
          "/reset-password",
          "/accept-invite",
        ],
      },
    ],
    sitemap: "https://diraschool.com/sitemap.xml",
  };
}
