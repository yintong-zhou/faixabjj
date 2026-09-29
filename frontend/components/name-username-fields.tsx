"use client";

import { useState } from "react";
import { suggestUsername } from "@/utils/username";

// The name and username fields of a new account. The username follows the
// name as it is typed (Mario Rossi → mario.rossi) until the maestro edits it
// by hand; from then on it is theirs. Without JavaScript the field stays
// empty and the action suggests one from the name.
export function NameUsernameFields({
  nameLabel,
  usernameLabel,
  usernameHelp,
  fieldClass,
}: {
  nameLabel: string;
  usernameLabel: string;
  usernameHelp: string;
  fieldClass: string;
}) {
  const [name, setName] = useState("");
  const [typed, setTyped] = useState<string | null>(null);
  const username = typed ?? (name.trim() ? suggestUsername(name) : "");

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="full_name" className="text-sm font-medium">
          {nameLabel}
        </label>
        <input
          id="full_name"
          name="full_name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-sm font-medium">
          {usernameLabel}
        </label>
        <input
          id="username"
          name="username"
          required
          value={username}
          onChange={(event) => setTyped(event.target.value)}
          maxLength={30}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={fieldClass}
        />
        <p className="text-xs text-foreground/55">{usernameHelp}</p>
      </div>
    </>
  );
}
