import { ComingSoon } from "@/components/social/coming-soon";

export default function InstagramPage() {
  return (
    <ComingSoon
      title="Instagram"
      description="Followers, reach, views and engagement of our Instagram account."
      needs={[
        "The Instagram account switched to Business or Creator (free, in the Instagram app).",
        "A free Meta developer app at developers.facebook.com.",
      ]}
    />
  );
}
