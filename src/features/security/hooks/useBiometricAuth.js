import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../infrastructure/supabase/supabaseClient.js';

function supportsNativeWebAuthn() {
  return Boolean(
    typeof window !== 'undefined'
    && window.isSecureContext
    && typeof navigator !== 'undefined'
    && navigator.credentials
    && window.PublicKeyCredential,
  );
}

function biometricLabel() {
  if (typeof navigator === 'undefined') return 'Biométrie';
  const userAgent = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'Face ID';
  if (/Windows/i.test(userAgent)) return 'Windows Hello';
  return 'Biométrie';
}

function friendlyBiometricError(error, label) {
  const code = error?.code || error?.name || '';
  if (code === 'passkey_disabled') return `${label} n’est pas encore activé pour Mon Foyer.`;
  if (code === 'webauthn_credential_not_found') return `Aucune passkey ${label} n’est enregistrée pour ce compte.`;
  if (code === 'webauthn_credential_exists' || code === 'InvalidStateError') return `${label} est déjà associé à ce compte.`;
  if (code === 'NotAllowedError' || String(error?.message || '').toLowerCase().includes('cancel')) {
    return `Identification ${label} annulée ou arrivée à expiration.`;
  }
  if (code === 'SecurityError') return `${label} est disponible uniquement depuis l’adresse sécurisée officielle de Mon Foyer.`;
  return error?.message || `Identification ${label} impossible.`;
}

function nativeJsonCeremonySupported() {
  return Boolean(
    window.PublicKeyCredential?.parseCreationOptionsFromJSON
    && window.PublicKeyCredential?.parseRequestOptionsFromJSON
    && window.PublicKeyCredential?.prototype?.toJSON,
  );
}

async function createNativeCredential(options) {
  const publicKey = window.PublicKeyCredential.parseCreationOptionsFromJSON(options);
  const credential = await navigator.credentials.create({ publicKey });
  if (!(credential instanceof window.PublicKeyCredential)) {
    throw new Error('La passkey créée par le navigateur est invalide.');
  }
  return credential.toJSON();
}

async function getNativeCredential(options) {
  const publicKey = window.PublicKeyCredential.parseRequestOptionsFromJSON(options);
  const credential = await navigator.credentials.get({ publicKey });
  if (!(credential instanceof window.PublicKeyCredential)) {
    throw new Error('La réponse WebAuthn du navigateur est invalide.');
  }
  return credential.toJSON();
}

function passkeyRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.passkeys)) return data.passkeys;
  return [];
}

export default function useBiometricAuth(expectedUserId) {
  const label = useMemo(biometricLabel, []);
  const [credentials, setCredentials] = useState([]);
  const [isSupported, setIsSupported] = useState(supportsNativeWebAuthn);
  const [isPlatformAuthenticatorAvailable, setIsPlatformAuthenticatorAvailable] = useState(false);
  const [configurationRequired, setConfigurationRequired] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('');

  const refreshCredentials = useCallback(async ({ silent = true } = {}) => {
    if (!supportsNativeWebAuthn() || !supabase?.auth?.passkey?.list) {
      setIsSupported(false);
      setCredentials([]);
      return [];
    }
    const { data, error } = await supabase.auth.passkey.list();
    if (error) {
      setCredentials([]);
      setConfigurationRequired(error.code === 'passkey_disabled');
      if (!silent && error.code !== 'passkey_disabled') setStatus(friendlyBiometricError(error, label));
      return [];
    }
    const rows = passkeyRows(data);
    setConfigurationRequired(false);
    setCredentials(rows);
    return rows;
  }, [label]);

  useEffect(() => {
    let active = true;
    const detect = async () => {
      const supported = supportsNativeWebAuthn();
      if (!active) return;
      setIsSupported(supported);
      if (!supported) return;
      try {
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();
        if (active) setIsPlatformAuthenticatorAvailable(Boolean(available));
      } catch {
        if (active) setIsPlatformAuthenticatorAvailable(false);
      }
      if (active && expectedUserId) await refreshCredentials();
    };
    detect();
    return () => { active = false; };
  }, [expectedUserId, refreshCredentials]);

  const registerBiometrics = useCallback(async () => {
    if (!isSupported || !expectedUserId) return false;
    setIsBusy(true);
    setStatus(`Association de ${label}…`);
    try {
      if (nativeJsonCeremonySupported() && supabase?.auth?.passkey?.startRegistration) {
        const { data: started, error: startError } = await supabase.auth.passkey.startRegistration();
        if (startError) throw startError;
        const credential = await createNativeCredential(started.options);
        const { data, error } = await supabase.auth.passkey.verifyRegistration({
          challengeId: started.challenge_id,
          credential,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.registerPasskey();
        if (error) throw error;
      }
      await refreshCredentials();
      setStatus(`${label} est maintenant associé à ce compte.`);
      return true;
    } catch (error) {
      setConfigurationRequired(error?.code === 'passkey_disabled');
      setStatus(friendlyBiometricError(error, label));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [expectedUserId, isSupported, label, refreshCredentials]);

  const authenticateBiometrics = useCallback(async () => {
    if (!isSupported || !expectedUserId) return false;
    setIsBusy(true);
    setStatus(`Identification ${label}…`);
    try {
      let data;
      if (nativeJsonCeremonySupported() && supabase?.auth?.passkey?.startAuthentication) {
        const { data: started, error: startError } = await supabase.auth.passkey.startAuthentication();
        if (startError) throw startError;
        const credential = await getNativeCredential(started.options);
        const { data: verified, error } = await supabase.auth.passkey.verifyAuthentication({
          challengeId: started.challenge_id,
          credential,
        });
        if (error) throw error;
        data = verified;
      } else {
        const { data: verified, error } = await supabase.auth.signInWithPasskey();
        if (error) throw error;
        data = verified;
      }
      if (data?.user?.id !== expectedUserId) {
        await supabase.auth.signOut({ scope: 'local' });
        throw new Error('La passkey utilisée ne correspond pas au compte actuellement connecté.');
      }
      setStatus(`${label} confirmé.`);
      return true;
    } catch (error) {
      setConfigurationRequired(error?.code === 'passkey_disabled');
      setStatus(friendlyBiometricError(error, label));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [expectedUserId, isSupported, label]);

  return {
    authenticateBiometrics,
    biometricLabel: label,
    clearBiometricStatus: () => setStatus(''),
    configurationRequired,
    credentials,
    hasRegisteredBiometrics: credentials.length > 0,
    isBusy,
    isPlatformAuthenticatorAvailable,
    isSupported,
    refreshCredentials,
    registerBiometrics,
    status,
  };
}
