import type { PokeUser } from "../../core/types.js";
import { initials, userColor } from "../util.js";

export function Avatar({ user, size = 22 }: { user: PokeUser; size?: number }) {
  const style = { width: size, height: size, background: userColor(user) };
  return (
    <span class="poke-avatar" style={style} title={user.name}>
      {user.avatar && /^https?:|^data:/.test(user.avatar) ? (
        <img src={user.avatar} alt={user.name} />
      ) : (
        initials(user.name)
      )}
    </span>
  );
}
