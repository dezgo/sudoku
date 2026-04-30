package com.derekgillett.sudoku

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
        setContent {
            SudokuRoot(
                viewModel = viewModel,
                prefsRepo = container.prefsRepo,
                authRepo = container.authRepo,
                groupsRepo = container.groupsRepo,
                dailyRepo = container.dailyRepo
            )
        }
    }
}
