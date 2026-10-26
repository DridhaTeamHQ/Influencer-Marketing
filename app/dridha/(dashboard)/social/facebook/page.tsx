import { ComingSoon } from "@/components/social/coming-soon";

export default function FacebookPage() {
  return (
    <ComingSoon
      title="Facebook"
      description="Followers, reach and engagement of our Facebook Page."
      needs={[
        "A Facebook Page (personal profiles share almost no data).",
        "The same free Meta developer app as Instagram.",
      ]}
    />
  );
}
