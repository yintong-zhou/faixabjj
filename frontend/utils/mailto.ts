// A mailto: link that opens the reader's mail app on a ready-made message.
// Subject and body are percent-encoded on their own (a `&` or `?` in the text
// must not end the parameter), and lines are joined with CRLF, the line break
// RFC 6068 asks for — some mail apps ignore a bare `\n`.
export function mailtoHref(to: string, subject: string, bodyLines: string[]): string {
  const subjectPart = encodeURIComponent(subject);
  const bodyPart = encodeURIComponent(bodyLines.join("\r\n"));
  return `mailto:${to}?subject=${subjectPart}&body=${bodyPart}`;
}
