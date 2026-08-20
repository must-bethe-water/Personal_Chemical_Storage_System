const CAS_PATTERN = /^\d{2,7}-\d{2}-\d$/;

function hasValidCasChecksum(cas: string) {
  const digits = cas.replaceAll("-", "");
  const checkDigit = Number(digits.at(-1));
  const body = digits.slice(0, -1).split("").reverse();
  const checksum = body.reduce((sum, digit, index) => sum + Number(digit) * (index + 1), 0) % 10;
  return checksum === checkDigit;
}

export async function GET(request: Request) {
  const cas = new URL(request.url).searchParams.get("cas")?.trim() ?? "";
  if (!CAS_PATTERN.test(cas) || !hasValidCasChecksum(cas)) {
    return Response.json({ error: "invalid_cas" }, { status: 400 });
  }

  const endpoint = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(cas)}/property/Title,MolecularFormula,IUPACName/JSON`;
  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (response.status === 404) return Response.json({ error: "not_found" }, { status: 404 });
    if (!response.ok) return Response.json({ error: "upstream_error" }, { status: 503 });

    const payload = await response.json() as {
      PropertyTable?: { Properties?: Array<{ CID?: number; Title?: string; IUPACName?: string; MolecularFormula?: string; }> };
    };
    const compound = payload.PropertyTable?.Properties?.[0];
    const name = compound?.Title || compound?.IUPACName;
    if (!compound || !name || !compound.MolecularFormula) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    return Response.json(
      { name, formula: compound.MolecularFormula, cid: compound.CID, source: "PubChem" },
      { headers: { "Cache-Control": "public, max-age=86400" } },
    );
  } catch {
    return Response.json({ error: "upstream_error" }, { status: 503 });
  }
}
