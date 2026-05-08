package com.derekgillett.sudoku

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.derekgillett.sudoku.state.SudokuGameViewModel
import com.derekgillett.sudoku.ui.SudokuRoot

class MainActivity : ComponentActivity() {

    private val viewModel: SudokuGameViewModel by viewModels {
        SudokuGameViewModel.Factory((application as SudokuApplication).container)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as SudokuApplication).container
        handleAppLink(intent, container)
        setContent {
            SudokuRoot(
                viewModel = viewModel,
                prefsRepo = container.prefsRepo,
                authRepo = container.authRepo,
                groupsRepo = container.groupsRepo,
                dailyRepo = container.dailyRepo,
                scoresRepo = container.scoresRepo,
                coachRepo = container.coachRepo,
                multiplayerRepo = container.multiplayerRepo,
                historyRepo = container.historyRepo
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val container = (application as SudokuApplication).container
        handleAppLink(intent, container)
    }

    /** Extracts a 6-char invite code from a https://sudoku.appfoundry.cc/m/<code>
     *  URL and hands it to MultiplayerRepository for the UI layer to act on. */
    private fun handleAppLink(intent: Intent?, container: AppContainer) {
        val data: Uri = intent?.data ?: return
        if (data.host?.equals("sudoku.appfoundry.cc", ignoreCase = true) != true) return
        val segments = data.pathSegments
        if (segments.size < 2 || !segments[0].equals("m", ignoreCase = true)) return
        val code = segments[1].uppercase()
            .filter { it.isLetterOrDigit() }
            .take(6)
        if (code.isEmpty()) return
        container.multiplayerRepo.setPendingInviteCode(code)
    }
}
