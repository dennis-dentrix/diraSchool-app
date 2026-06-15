import { getDocumentHeaderData } from '@/lib/document-print';
import { useSignedUrl } from '@/hooks/use-signed-url';

export function SchoolDocumentHeader({
  school,
  settings,
  title,
  subtitle,
  serial,
  generatedAt,
}) {
  const data = getDocumentHeaderData({ school, settings, title, subtitle, serial, generatedAt });
  const logoUrl = useSignedUrl(data.logoUrl || null);

  return (
    <div className="border rounded-md px-4 py-3 mb-3">
      <div className="flex items-start gap-3">
        {logoUrl && (
          <img
            src={logoUrl}
            alt="School logo"
            className="h-14 w-14 object-contain border rounded-md p-1 bg-white"
          />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold uppercase tracking-wide leading-tight">
            {data.schoolName}
          </h1>
          {data.motto && <p className="text-sm italic text-gray-600">"{data.motto}"</p>}
          {data.contact && <p className="text-sm text-gray-700">{data.contact}</p>}
          {data.address && <p className="text-sm text-gray-700">{data.address}</p>}
        </div>
        <div className="text-right shrink-0 max-w-[45%]">
          {data.title && (
            <p className="text-[11px] uppercase tracking-wider text-gray-500">{data.title}</p>
          )}
          {data.subtitle && <p className="text-base font-bold">{data.subtitle}</p>}
          {data.serial && (
            <p className="text-xs mt-1">
              Serial: <span className="font-mono font-semibold">{data.serial}</span>
            </p>
          )}
          {data.generatedAt && (
            <p className="text-[11px] text-gray-500 mt-0.5">Generated: {data.generatedAt}</p>
          )}
        </div>
      </div>
    </div>
  );
}
