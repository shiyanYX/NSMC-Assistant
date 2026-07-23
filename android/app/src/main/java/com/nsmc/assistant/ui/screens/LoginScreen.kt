package com.nsmc.assistant.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nsmc.assistant.LoginState
import com.nsmc.assistant.RustBridge
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun LoginScreen(onLoginSuccess: (LoginState) -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            "川", style = MaterialTheme.typography.displaySmall,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.height(8.dp))
        Text("川北医助手", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("NSMC Assistant", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(32.dp))

        if (error.isNotEmpty()) {
            AssistChip(
                onClick = {},
                label = { Text(error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp) },
                colors = AssistChipDefaults.assistChipColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                ),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(12.dp))
        }

        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("学号") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("密码") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(24.dp))

        Button(
            onClick = {
                if (username.isBlank() || password.isBlank()) {
                    error = "请输入学号和密码"; return@Button
                }
                loading = true; error = ""
                scope.launch {
                    try {
                        val data = withContext(Dispatchers.IO) {
                            RustBridge.login(username.trim(), password.trim())
                        }
                        val name = data.get("name")?.asString ?: username.trim()
                        onLoginSuccess(LoginState(username.trim(), password.trim(), name))
                    } catch (e: Exception) {
                        error = e.message ?: "登录失败"
                    } finally { loading = false }
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth().height(50.dp)
        ) {
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                Spacer(Modifier.width(8.dp))
            }
            Text(if (loading) "登录中..." else "登录")
        }
    }
}
