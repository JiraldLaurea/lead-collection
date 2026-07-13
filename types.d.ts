declare module "*.cjs";

// The smpp package ships no types. lib/sms.ts casts it to its own SmppModule shape.
declare module "smpp";
