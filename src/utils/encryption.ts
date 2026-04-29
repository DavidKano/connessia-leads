/**
 * Basic encryption utility using Web Crypto API.
 */

const SECRET_KEY = "connessia-leads-v1-master-key"; // In production, this should be more dynamic

export async function encrypt(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  const key = await getEncryptionKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Convert to Base64
  let binary = "";
  combined.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export async function decrypt(encoded: string): Promise<string> {
  const binary = atob(encoded);
  const combined = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    combined[i] = binary.charCodeAt(i);
  }
  
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const key = await getEncryptionKey();
  
  try {
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Decryption failed", e);
    throw new Error("Failed to decrypt");
  }
}

async function getEncryptionKey() {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(SECRET_KEY);
  const hash = await window.crypto.subtle.digest("SHA-256", keyData);
  
  return window.crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}
