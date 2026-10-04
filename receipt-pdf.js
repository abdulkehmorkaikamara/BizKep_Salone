// Builds a sale receipt as a small PDF, sized for an 80 mm receipt printer,
// with the BizKep logo at the top. No library is needed: it writes the PDF by
// hand using the built-in Helvetica fonts, so it also works offline.
(() => {
  "use strict";

  const PAGE_WIDTH = 226.77; // 80 mm in points
  const MARGIN = 16;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
  const INK = [0.07, 0.13, 0.11];
  const MUTED = [0.42, 0.47, 0.45];
  const GREEN = [0.043, 0.302, 0.231];
  const GOLD = [0.906, 0.714, 0.31];

  // Character widths (1/1000 em) for printable ASCII, from the Helvetica metrics.
  const WIDTHS = {
    regular: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
    bold: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]
  };
  // Characters outside Latin-1 that the PDF's WinAnsi encoding still has.
  const WIN_ANSI = {"€":0x80,"‚":0x82,"„":0x84,"…":0x85,"‘":0x91,"’":0x92,"“":0x93,"”":0x94,"•":0x95,"–":0x96,"—":0x97,"™":0x99};

  // Converts text to the single-byte characters the built-in fonts can show.
  function encode(text) {
    let out = "";
    for (const char of String(text ?? "")) {
      const code = char.codePointAt(0);
      if (char === "−") out += "-";
      else if (WIN_ANSI[char]) out += String.fromCharCode(WIN_ANSI[char]);
      else if ((code >= 32 && code < 127) || (code >= 160 && code <= 255)) out += char;
      else if (char === "\t" || char === "\n") out += " ";
      else out += "?";
    }
    return out;
  }
  function textWidth(encoded, size, bold) {
    const table = bold ? WIDTHS.bold : WIDTHS.regular;
    let units = 0;
    for (let i = 0; i < encoded.length; i++) {
      const code = encoded.charCodeAt(i);
      units += code >= 32 && code < 127 ? table[code - 32] : code === 0xB7 ? 278 : 556;
    }
    return units * size / 1000;
  }
  function wrap(text, size, bold, width) {
    const lines = [];
    let line = "";
    for (const word of encode(text).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size, bold) <= width || !line) line = next;
      else { lines.push(line); line = word; }
      // Break a single word that is still too long.
      while (textWidth(line, size, bold) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && textWidth(line.slice(0, cut), size, bold) > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    if (line) lines.push(line);
    return lines;
  }
  const escapePdf = encoded => encoded.replace(/[\\()]/g, c => `\\${c}`);
  const num = value => (Math.round(value * 100) / 100).toString();
  const color = ([r, g, b]) => `${num(r)} ${num(g)} ${num(b)}`;

  // Turns the logo's SVG path data (M, L, H, V, C and Z, absolute or relative)
  // into PDF path operators in the same 512 × 512 coordinate space.
  function svgPathToPdf(d) {
    const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g);
    const ops = [];
    let i = 0, command = "", x = 0, y = 0, startX = 0, startY = 0;
    const next = () => Number(tokens[i++]);
    while (i < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
      const relative = command === command.toLowerCase();
      const ox = relative ? x : 0, oy = relative ? y : 0;
      switch (command.toUpperCase()) {
        case "M":
          x = ox + next(); y = oy + next(); startX = x; startY = y;
          ops.push(`${num(x)} ${num(y)} m`);
          command = relative ? "l" : "L"; // extra pairs after a move are lines
          break;
        case "L": x = ox + next(); y = oy + next(); ops.push(`${num(x)} ${num(y)} l`); break;
        case "H": x = (relative ? x : 0) + next(); ops.push(`${num(x)} ${num(y)} l`); break;
        case "V": y = (relative ? y : 0) + next(); ops.push(`${num(x)} ${num(y)} l`); break;
        case "C": {
          const points = [next(), next(), next(), next(), next(), next()];
          const [x1, y1, x2, y2, x3, y3] = points.map((value, index) => value + (index % 2 ? oy : ox));
          ops.push(`${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)} ${num(x3)} ${num(y3)} c`);
          x = x3; y = y3;
          break;
        }
        case "Z": ops.push("h"); x = startX; y = startY; break;
        default: throw new Error(`Unsupported path command ${command}`);
      }
    }
    return ops.join("\n");
  }
  const K = 0.5523; // control-point distance for drawing circle quarters
  function roundedRect(x, y, w, h, r) {
    const c = r * K;
    return [
      `${x + r} ${y} m`, `${x + w - r} ${y} l`, `${x + w - r + c} ${y} ${x + w} ${y + r - c} ${x + w} ${y + r} c`,
      `${x + w} ${y + h - r} l`, `${x + w} ${y + h - r + c} ${x + w - r + c} ${y + h} ${x + w - r} ${y + h} c`,
      `${x + r} ${y + h} l`, `${x + r - c} ${y + h} ${x} ${y + h - r + c} ${x} ${y + h - r} c`,
      `${x} ${y + r} l`, `${x} ${y + r - c} ${x + r - c} ${y} ${x + r} ${y} c`, "h"
    ].join("\n");
  }
  function circle(cx, cy, r) {
    const c = r * K;
    return [
      `${cx + r} ${cy} m`,
      `${cx + r} ${cy + c} ${cx + c} ${cy + r} ${cx} ${cy + r} c`,
      `${cx - c} ${cy + r} ${cx - r} ${cy + c} ${cx - r} ${cy} c`,
      `${cx - r} ${cy - c} ${cx - c} ${cy - r} ${cx} ${cy - r} c`,
      `${cx + c} ${cy - r} ${cx + r} ${cy - c} ${cx + r} ${cy} c`, "h"
    ].join("\n");
  }
  // The same drawing as icon.svg.
  const LOGO_LETTER = "M148 102h132c74 0 118 34 118 91 0 37-20 64-54 78 45 12 69 43 69 84 0 66-51 105-137 105H148V102Zm119 142c35 0 53-13 53-38 0-24-18-36-53-36h-40v74h40Zm8 147c39 0 59-14 59-42 0-27-20-41-59-41h-48v83h48Z";
  function logo(x, top, size) {
    // Map the logo's 512-unit, y-down space onto the page.
    return [
      "q", `${num(size / 512)} 0 0 ${num(-size / 512)} ${num(x)} ${num(top)} cm`,
      `${color(GREEN)} rg`, roundedRect(0, 0, 512, 512, 120), "f",
      "1 1 1 rg", svgPathToPdf(LOGO_LETTER), "f*",
      `${color(GOLD)} rg`, circle(385, 127, 38), "f",
      "Q"
    ].join("\n");
  }

  // receipt: {business:{name,address,phone}, number, soldAt, details:[[label,value]],
  //           items:[{name,qty,unitPrice,amount}], totals:[[label,value]], total, paid:[[label,value]], footer}
  // Amounts arrive already formatted as text.
  function build(receipt) {
    const blocks = []; // drawing commands that need the final page height
    let y = MARGIN; // distance from the top of the page

    // Takes text already converted with encode().
    const text = (encoded, x, size, {bold = false, tint = INK, align = "left"} = {}) => {
      const width = textWidth(encoded, size, bold);
      const left = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
      const baseline = y + size * 0.8;
      blocks.push(height => `BT /${bold ? "F2" : "F1"} ${size} Tf ${color(tint)} rg ${num(left)} ${num(height - baseline)} Td (${escapePdf(encoded)}) Tj ET`);
    };
    const row = (label, value, size, options = {}) => {
      value = encode(value);
      const valueWidth = textWidth(value, size, options.bold);
      const lines = wrap(label, size, options.bold, CONTENT_WIDTH - valueWidth - 8);
      lines.forEach((line, index) => {
        text(line, MARGIN, size, options);
        if (index === 0) text(value, PAGE_WIDTH - MARGIN, size, {...options, align: "right"});
        y += size * 1.35;
      });
    };
    const centered = (value, size, options = {}) => {
      for (const line of wrap(value, size, options.bold, CONTENT_WIDTH)) {
        text(line, PAGE_WIDTH / 2, size, {...options, align: "center"});
        y += size * 1.35;
      }
    };
    const divider = () => {
      y += 5;
      const at = y;
      blocks.push(height => `q ${color(MUTED)} RG 0.6 w [2 2] 0 d ${MARGIN} ${num(height - at)} m ${num(PAGE_WIDTH - MARGIN)} ${num(height - at)} l S Q`);
      y += 8;
    };

    const logoSize = 44, logoTop = y;
    blocks.push(height => logo((PAGE_WIDTH - logoSize) / 2, height - logoTop, logoSize));
    y += logoSize + 10;
    centered(receipt.business.name || "BizKep", 13, {bold: true});
    const contact = [receipt.business.address, receipt.business.phone].filter(Boolean);
    for (const line of contact) centered(line, 8, {tint: MUTED});

    divider();
    row(`Receipt #${receipt.number}`, receipt.soldAt, 8, {bold: true});
    for (const [label, value] of receipt.details) row(label, value, 8, {tint: MUTED});

    divider();
    for (const item of receipt.items) {
      row(item.name, item.amount, 9);
      text(encode(`${item.qty} × ${item.unitPrice}`), MARGIN, 7.5, {tint: MUTED});
      y += 7.5 * 1.35 + 3;
    }

    divider();
    for (const [label, value] of receipt.totals) row(label, value, 8.5, {tint: MUTED});
    y += 2;
    row("Total", receipt.total, 12, {bold: true});
    y += 2;
    for (const [label, value] of receipt.paid) row(label, value, 8.5);

    divider();
    if (receipt.footer) centered(receipt.footer, 9, {bold: true});
    y += 4;
    centered("Powered by BizKep · bizkepsl.com", 7, {tint: MUTED});
    y += MARGIN - 4;

    const height = Math.ceil(y);
    const content = blocks.map(draw => draw(height)).join("\n");
    const title = encode(`Receipt #${receipt.number}`);
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${height}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      `<< /Title (${escapePdf(title)}) /Producer (BizKep) >>`
    ];
    // Every character is one byte, so string positions are byte offsets.
    let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets = objects.map((body, index) => {
      const offset = pdf.length;
      pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
      return offset;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i);
    return new Blob([bytes], {type: "application/pdf"});
  }

  window.BizKepReceiptPdf = {build};
})();
