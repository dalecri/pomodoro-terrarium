package com.pomodoroterrarium.app;

import android.app.Activity;
import android.app.PendingIntent;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.util.Arrays;
import java.util.List;

/**
 * Hands the web layer an OAuth access token for Google Tasks, using Google Play
 * services' Authorization API. The user consents once (interactive = true); after
 * that every call returns a fresh token silently, which is what background syncs use.
 */
@CapacitorPlugin(name = "GoogleTasksAuth")
public class GoogleTasksAuthPlugin extends Plugin {

    private static final List<Scope> SCOPES = Arrays.asList(
        new Scope("https://www.googleapis.com/auth/tasks"),
        new Scope("email")
    );

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        // registered while the activity is being created, as the Activity Result API requires
        consentLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            res -> {
                PluginCall call = pendingCall;
                pendingCall = null;
                if (call == null) return;
                if (res.getResultCode() != Activity.RESULT_OK) {
                    call.reject("Google sign-in was cancelled", "CANCELLED");
                    return;
                }
                try {
                    AuthorizationResult result = Identity.getAuthorizationClient(getActivity())
                        .getAuthorizationResultFromIntent(res.getData());
                    resolveToken(call, result);
                } catch (Exception e) {
                    call.reject(e.getMessage(), "AUTH_FAILED");
                }
            }
        );
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        AuthorizationRequest request = AuthorizationRequest.builder().setRequestedScopes(SCOPES).build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    resolveToken(call, result);
                    return;
                }
                // consent (or an account choice) is needed: only show UI when the user asked to connect
                if (!interactive) {
                    call.reject("Google needs you to sign in again", "NEEDS_CONSENT");
                    return;
                }
                PendingIntent intent = result.getPendingIntent();
                if (intent == null) {
                    call.reject("Google did not provide a sign-in screen", "AUTH_FAILED");
                    return;
                }
                pendingCall = call;
                consentLauncher.launch(new IntentSenderRequest.Builder(intent.getIntentSender()).build());
            })
            .addOnFailureListener(e -> call.reject(e.getMessage(), "AUTH_FAILED"));
    }

    private void resolveToken(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            call.reject("Google returned no access token", "AUTH_FAILED");
            return;
        }
        JSObject out = new JSObject();
        out.put("accessToken", token);
        call.resolve(out);
    }
}
