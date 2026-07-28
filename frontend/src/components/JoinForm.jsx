import { ProfileForm } from "./ProfileForm";

export function JoinForm({ onJoin }) {
  return (
    <ProfileForm
      title="Take a desk"
      initial={{}}
      submitLabel="Walk in"
      onSubmit={onJoin}
    />
  );
}
