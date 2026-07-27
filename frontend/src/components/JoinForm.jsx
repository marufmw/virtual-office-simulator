import { ProfileForm } from "./ProfileForm";

export function JoinForm({ onJoin }) {
  return (
    <ProfileForm
      title="Join the office"
      initial={{}}
      submitLabel="Join"
      onSubmit={onJoin}
    />
  );
}
